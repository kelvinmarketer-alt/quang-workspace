// Pomodoro (01/11 sếp duyệt): ▶ ở 1 việc → 25 phút tập trung → 5 phút nghỉ. Giữ đồng hồ theo mốc kết thúc (endsAt)
// trong localStorage → đổi trang / tải lại vẫn chạy đúng. Đếm 🍅 theo việc (task.pomos) + theo ngày (qws_pomo_day).
import { useEffect, useState } from "react";

export const WORK = 25 * 60, BREAK = 5 * 60;
const KEY = "qws_pomo", DAY = "qws_pomo_day", subs = new Set();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
let st = read();
const save = () => { try { st ? localStorage.setItem(KEY, JSON.stringify(st)) : localStorage.removeItem(KEY); } catch { /* bỏ qua */ } subs.forEach((f) => f()); };

export function startPomo(task) { st = { taskId: task.id, title: task.title, phase: "work", total: WORK, endsAt: Date.now() + WORK * 1000 }; save(); }
export function startBreak() { if (st) { st = { ...st, phase: "break", total: BREAK, endsAt: Date.now() + BREAK * 1000 }; save(); } }
export function stopPomo() { st = null; save(); }
export function pomoState() { return st; }
export function dayCount() { try { const v = JSON.parse(localStorage.getItem(DAY) || "null"); return v?.d === today() ? v.n : 0; } catch { return 0; } }
export function bumpDay() { try { localStorage.setItem(DAY, JSON.stringify({ d: today(), n: dayCount() + 1 })); } catch { /* bỏ qua */ } subs.forEach((f) => f()); }

export function usePomo() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    const h = (e) => { if (e.key === KEY) { st = read(); f(); } };
    window.addEventListener("storage", h);
    return () => { subs.delete(f); window.removeEventListener("storage", h); };
  }, []);
  return st;
}

// Tiếng "ting" ngắn khi hết phiên (không cần file âm thanh)
export function chime() {
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((hz, i) => { const o = A.createOscillator(), g = A.createGain(); o.frequency.value = hz; o.connect(g); g.connect(A.destination); const t = A.currentTime + i * 0.18; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.start(t); o.stop(t + 0.4); });
  } catch { /* trình duyệt chặn âm thanh */ }
}
