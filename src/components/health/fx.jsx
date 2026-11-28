// SỨC KHOẺ — mỗi tính năng một kiểu hiển thị sống động (21/11/2026)
// Nước = bể nước sóng sánh · Calo = ngọn lửa · Tập = thanh tạ thêm bánh · Bước chân = vệt dấu chân · Huy hiệu = huy chương · Nhịn ăn = đồng hồ 24 giờ
import { useEffect, useRef, useState } from "react";
import "./fx.css";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const vn = (v, d = 0) => Number(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d });

// Số đếm chạy tới giá trị mới
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (still || typeof requestAnimationFrame === "undefined") { setV(target); from.current = target; return undefined; }
    const a = from.current, t0 = performance.now(); let raf;
    const step = (t) => { const k = clamp((t - t0) / ms), e = 1 - Math.pow(1 - k, 3); setV(a + (target - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = target; };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}
// Lần đầu vẽ: bắt đầu từ 0 rồi mới chạy lên (thanh, ống tự đầy khi mở trang)
function useMounted() { const [m, setM] = useState(false); useEffect(() => { const t = setTimeout(() => setM(true), 60); return () => clearTimeout(t); }, []); return m; }

const WAVE = "M0 12 Q50 0 100 12 T200 12 T300 12 T400 12 V24 H0 Z";
function Waves() {
  return (<>
    <svg className="sk-wave w2" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden><path d={WAVE} /></svg>
    <svg className="sk-wave w1" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden><path d={WAVE} /></svg>
  </>);
}
const BUBBLES = [[18, 5, 4.2, 0], [42, 4, 5.5, 1.3], [63, 6, 3.8, 2.1], [80, 3, 6.1, .6], [30, 3, 5, 3], [55, 4, 4.6, 3.8]];

// BỂ NƯỚC: mỗi lần uống có giọt nước rơi xuống, mặt nước bắn tung và sóng sánh; đầy bể thì đổi màu ngọc
export function WaterTank({ ml, goal, height = 230, width = 118 }) {
  const mounted = useMounted();
  const pct = clamp(goal > 0 ? ml / goal : 0);
  const full = ml >= goal && goal > 0;
  const [drop, setDrop] = useState(0);
  const prev = useRef(ml);
  useEffect(() => { if (ml > prev.current) setDrop(Date.now()); prev.current = ml; }, [ml]);
  useEffect(() => { if (!drop) return undefined; const t = setTimeout(() => setDrop(0), 1500); return () => clearTimeout(t); }, [drop]);
  const lvl = mounted ? pct : 0;
  const surface = height - 6 - lvl * (height - 6); // px từ đỉnh xuống mặt nước
  const step = goal > 2500 ? 1000 : 500;
  const marks = []; for (let m = step; m < goal; m += step) marks.push(m);
  return (
    <div className={`sk-tank ${full ? "full" : ""}`} style={{ height, width }} role="img" aria-label={`Bể nước: ${vn(ml)} trên ${vn(goal)} ml`}>
      <div className={`sk-fill ${drop ? "slosh" : ""}`} style={{ height: `${lvl * 100}%` }}>
        <div className="sk-fill-body" />
        {lvl > 0.02 && <Waves />}
        {lvl > 0.08 && BUBBLES.map(([l, s, d, dl], i) => <span key={i} className="sk-bubble" style={{ left: `${l}%`, width: s, height: s, animationDuration: `${d}s`, animationDelay: `${dl}s` }} />)}
      </div>
      {marks.map((m) => <div key={m} className="sk-mark" style={{ bottom: `calc(${(m / goal) * 100}% - 6px)` }}><b>{vn(m / 1000, 1)}</b><i /></div>)}
      {drop ? <><span key={"d" + drop} className="sk-drop" style={{ "--fall": `${Math.max(10, surface - 18)}px` }} /><span key={"s" + drop} className="sk-splash" style={{ top: Math.max(4, surface - 8) }} /></> : null}
      <div className="sk-gloss" />
      <div className="absolute inset-x-0 bottom-2 z-[2] text-center text-[13px] font-extrabold text-white" style={{ textShadow: "0 1px 3px rgb(0 0 0 / .45)" }}>{Math.round(pct * 100)}%</div>
    </div>
  );
}

// Hàng ly: ly đã uống tô đầy, ly vừa uống nảy lên
export function CupRow({ count, total }) {
  const n = Math.min(14, Math.max(total, count));
  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`Đã uống ${count} trên ${total} ly`}>
      {Array.from({ length: n }, (_, i) => {
        const on = i < count;
        return (
          <svg key={i} width="18" height="22" viewBox="0 0 18 22" className={`sk-cup ${on && i === count - 1 ? "pop" : ""}`} aria-hidden>
            <path d="M2 2 H16 L14 20 H4 Z" fill="none" stroke={on ? "#0ea5e9" : "rgb(148 163 184 / .5)"} strokeWidth="1.6" strokeLinejoin="round" />
            {on && <path d="M3.6 7 H14.4 L13.1 19 H4.9 Z" fill="#38bdf8" />}
          </svg>
        );
      })}
    </div>
  );
}

// Ống nước mini cho 7 ngày
export function Tube({ pct, height = 54, width = 12 }) {
  const mounted = useMounted();
  const p = clamp(pct);
  return (
    <div className={`sk-tube mx-auto ${p >= 1 ? "sk-tank full" : ""}`} style={{ height, width, border: p >= 1 ? undefined : "none", boxShadow: "none", borderRadius: 9999 }}>
      <div className="sk-fill" style={{ height: `${(mounted ? p : 0) * 100}%` }}><div className="sk-fill-body" />{p > 0.05 && <Waves />}</div>
    </div>
  );
}

// NGỌN LỬA CALO: ăn càng nhiều lửa càng to, vượt mục tiêu thì chuyển đỏ
export function FlameMeter({ kcal, target, size = 96 }) {
  const mounted = useMounted();
  const pct = target > 0 ? kcal / target : 0;
  const over = target > 0 && kcal > target * 1.05;
  const s = mounted ? 0.45 + 0.6 * clamp(pct, 0, 1.15) : 0.45;
  const [o1, o2, i1, i2] = over ? ["#fb7185", "#e11d48", "#fecdd3", "#fb7185"] : ["#fbbf24", "#f97316", "#fef3c7", "#fbbf24"];
  return (
    <div className="relative grid place-items-end justify-center" style={{ width: size, height: size }} role="img" aria-label={`Đã ăn ${vn(kcal)} kcal${target ? ` trên ${vn(target)}` : ""}`}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="sk-flame" style={{ transform: `scale(${s})` }} aria-hidden>
        <defs>
          <linearGradient id="skf-o" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={o2} /><stop offset="1" stopColor={o1} /></linearGradient>
          <linearGradient id="skf-i" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={i2} /><stop offset="1" stopColor={i1} /></linearGradient>
        </defs>
        <g className="outer"><path d="M50 4 C58 22 80 34 80 62 C80 82 66 96 50 96 C34 96 20 82 20 62 C20 46 30 38 34 26 C38 38 44 40 46 44 C46 28 46 16 50 4 Z" fill="url(#skf-o)" /></g>
        <g className="inner"><path d="M50 40 C56 52 66 58 66 72 C66 84 58 92 50 92 C42 92 34 84 34 72 C34 62 42 58 44 50 C46 56 48 56 50 58 C50 52 49 46 50 40 Z" fill="url(#skf-i)" /></g>
      </svg>
      {pct > 0.05 && [-14, 6, 16, -4].map((dx, i) => <span key={i} className="sk-ember" style={{ left: `${45 + dx / 2}%`, "--dx": `${dx}px`, animationDelay: `${i * 0.6}s`, background: over ? "#fb7185" : undefined }} />)}
    </div>
  );
}

// Ống chất: đạm / tinh bột / béo — sọc chạy, tự đầy khi mở
export function Capsule({ label, value, max, unit = "g", color }) {
  const mounted = useMounted();
  const pct = max > 0 ? clamp(value / max) : 0, over = max > 0 && value > max * 1.05;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12.5px]"><span className="font-semibold text-slate-600">{label}</span><span className={`sk-num ${over ? "font-bold text-rose-600" : "text-slate-500"}`}><b className="text-slate-900">{vn(value)}</b> / {vn(max)} {unit}</span></div>
      <div className="sk-capsule"><span style={{ width: `${(mounted ? pct : 0) * 100}%`, backgroundColor: over ? "#f43f5e" : color }} /></div>
    </div>
  );
}

// THANH TẠ: mỗi hiệp xong thêm một bánh tạ hai bên; xong buổi thì thanh tạ nhấc lên
export function Barbell({ done, total, finished }) {
  const perSide = Math.max(1, Math.min(10, Math.ceil(Math.max(total, done, 1) / 2)));
  const plates = (side) => Array.from({ length: perSide }, (_, i) => {
    const idx = side === "L" ? i * 2 : i * 2 + 1; // hiệp 1 bên trái, hiệp 2 bên phải…
    const on = idx < done || finished;
    const h = 46 - Math.min(18, i * 3);
    return <span key={i} className={`sk-plate ${on ? "on" : ""}`} style={{ width: 8, height: h, "--from": side === "L" ? "-30px" : "30px", animationDelay: `${(idx % 2) * 0.05}s`, background: on ? (i % 2 ? "#059669" : "#10b981") : "transparent", border: on ? "none" : "1.5px dashed rgb(148 163 184 / .55)" }} />;
  });
  return (
    <div className={`sk-barbell flex items-center justify-center ${finished ? "lift" : ""}`} role="img" aria-label={finished ? "Đã tập xong" : `Đã xong ${done} trên ${total} hiệp`}>
      <span className="h-4 w-3 rounded-sm bg-slate-400" />
      <div className="flex flex-row-reverse items-center gap-[3px] px-1">{plates("L")}</div>
      <span className="h-[7px] flex-1 rounded-full bg-gradient-to-b from-slate-300 to-slate-500" style={{ maxWidth: 90, minWidth: 40 }} />
      <div className="flex items-center gap-[3px] px-1">{plates("R")}</div>
      <span className="h-4 w-3 rounded-sm bg-slate-400" />
    </div>
  );
}

// VỆT DẤU CHÂN: đi tới đâu in dấu chân tới đó, cuối đường là lá cờ mục tiêu
export function StepsTrail({ steps, goal }) {
  const N = 18, pct = goal > 0 ? clamp(steps / goal) : 0, on = Math.round(pct * N);
  const pt = (t) => ({ x: 14 + t * 262, y: 52 - 20 * Math.sin(t * Math.PI * 1.5) });
  const feet = Array.from({ length: N }, (_, i) => {
    const t = (i + 0.5) / N, p = pt(t), q = pt(t + 0.01);
    const ang = Math.atan2(q.y - p.y, q.x - p.x), side = i % 2 ? 1 : -1;
    return { x: p.x - Math.sin(ang) * 6 * side, y: p.y + Math.cos(ang) * 6 * side, a: (ang * 180) / Math.PI + 90 };
  });
  const cur = pt(Math.max(0.02, pct * 0.98));
  return (
    <svg viewBox="0 0 300 92" className="w-full" role="img" aria-label={`Đã đi ${vn(steps)} trên ${vn(goal)} bước`}>
      <path d={`M${pt(0).x} ${pt(0).y} ${Array.from({ length: 40 }, (_, i) => { const p = pt((i + 1) / 40); return `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(" ")}`} fill="none" stroke="rgb(148 163 184 / .25)" strokeWidth="16" strokeLinecap="round" />
      {feet.map((f, i) => (
        <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.a.toFixed(0)})`}>
          <g className={`sk-foot ${i < on ? "on" : ""}`} style={{ animationDelay: `${i * 0.06}s`, transformBox: "fill-box", transformOrigin: "center" }}>
            <ellipse cx="0" cy="1" rx="2.6" ry="4" fill={i < on ? "#8b5cf6" : "rgb(148 163 184)"} />
            <circle cx="0" cy="-4.8" r="1.7" fill={i < on ? "#8b5cf6" : "rgb(148 163 184)"} />
          </g>
        </g>
      ))}
      <g transform={`translate(${pt(1).x - 4} ${pt(1).y - 26})`}><rect x="0" y="0" width="2" height="26" fill="#64748b" /><path d="M2 1 L16 6 L2 11 Z" fill={pct >= 1 ? "#10b981" : "#f43f5e"} /></g>
      {steps > 0 && <><circle cx={cur.x} cy={cur.y} r="5" fill="#8b5cf6" className="sk-walker" /><circle cx={cur.x} cy={cur.y} r="5" fill="#8b5cf6" stroke="#fff" strokeWidth="2" /></>}
    </svg>
  );
}

// HUY CHƯƠNG: đạt rồi thì vàng óng có vệt sáng lướt qua, chưa đạt thì xám
export function Medal({ icon, label, got }) {
  return (
    <li className="flex flex-col items-center gap-1 text-center" title={got ? "Đã đạt" : "Chưa đạt"}>
      <span className={`sk-medal grid h-12 w-12 place-items-center rounded-full text-[22px] ${got ? "got" : ""}`} style={got ? { background: "radial-gradient(circle at 35% 30%, #fde68a, #f59e0b 60%, #b45309)", boxShadow: "0 4px 14px -4px rgb(245 158 11 / .8), inset 0 -3px 0 rgb(0 0 0 / .15)" } : { background: "rgb(148 163 184 / .16)", filter: "grayscale(1)", opacity: 0.5 }} aria-hidden>{icon}</span>
      <span className={`text-[11px] leading-tight ${got ? "font-bold text-slate-800" : "text-slate-400"}`}>{label}</span>
    </li>
  );
}

// ĐỒNG HỒ 24 GIỜ cho nhịn ăn: cung xanh = giờ ăn, kim chỉ giờ hiện tại
export function FastDial({ startMin, hours, nowMin, eating, size = 84 }) {
  const arc = (a0, a1, r) => { const p = (a) => [50 + r * Math.sin((a / 1440) * 2 * Math.PI), 50 - r * Math.cos((a / 1440) * 2 * Math.PI)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); const large = (a1 - a0 + 1440) % 1440 > 720 ? 1 : 0; return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`; };
  const end = (startMin + hours * 60) % 1440;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={eating ? "Đang trong giờ ăn" : "Đang nhịn"}>
      <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(139 92 246 / .25)" strokeWidth="10" />
      <path d={arc(startMin, end, 40)} fill="none" stroke="#10b981" strokeWidth="10" strokeLinecap="round" />
      {[0, 6, 12, 18].map((h) => <text key={h} x={50 + 27 * Math.sin((h / 24) * 2 * Math.PI)} y={53.5 - 27 * Math.cos((h / 24) * 2 * Math.PI)} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-slate-400">{h}</text>)}
      <g className="sk-hand" style={{ transform: `rotate(${(nowMin / 1440) * 360}deg)` }}><line x1="50" y1="50" x2="50" y2="14" stroke={eating ? "#059669" : "#7c3aed"} strokeWidth="3" strokeLinecap="round" /></g>
      <circle cx="50" cy="50" r="5" fill={eating ? "#059669" : "#7c3aed"} />
    </svg>
  );
}

// PHÁO GIẤY khi đạt mục tiêu (đặt trong khối có position: relative)
const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#facc15"];
export function Burst({ fire }) {
  const [k, setK] = useState(0);
  useEffect(() => { if (!fire) return undefined; setK(fire); const t = setTimeout(() => setK(0), 1500); return () => clearTimeout(t); }, [fire]);
  if (!k) return null;
  return (
    <div className="sk-burst" key={k} aria-hidden>
      {Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2, d = 70 + ((i * 37) % 60); return <i key={i} style={{ background: COLORS[i % COLORS.length], "--x": `${Math.cos(a) * d}px`, "--y": `${Math.sin(a) * d - 30}px`, "--r": `${(i * 47) % 360}deg`, animationDelay: `${(i % 5) * 0.02}s` }} />; })}
    </div>
  );
}
