// Gọi bot demo qua Web Worker; trình duyệt không hỗ trợ / worker lỗi → chạy ngay trên luồng chính (như cũ).
import { runSession } from "./paperBot.js";
let worker = null, broken = false, seq = 0;
const waiting = new Map();
function getWorker() {
  if (broken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./paperWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, progress, raw, error } = e.data || {}, w = waiting.get(id); if (!w) return;
      if (progress) return w.onProgress?.(progress);
      waiting.delete(id);
      if (error) w.reject(new Error(error)); else w.resolve(raw);
    };
    worker.onerror = () => { // worker hỏng → các yêu cầu đang chờ chạy lại trên luồng chính
      broken = true; worker = null;
      for (const [id, w] of waiting) { waiting.delete(id); runSession(w.session, w.onProgress).then(w.resolve, w.reject); }
    };
    return worker;
  } catch { broken = true; return null; }
}
export function runSessionAsync(session, onProgress) {
  const w = getWorker();
  if (!w) return runSession(session, onProgress);
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject, onProgress, session }); w.postMessage({ id, session }); });
}
