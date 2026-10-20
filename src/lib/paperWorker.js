// Chạy bot demo trong LUỒNG RIÊNG (Web Worker) — tải + tính toán hàng chục nghìn nến không làm đơ giao diện.
import { runSession } from "./paperBot.js";
self.onmessage = async (e) => {
  const { id, session } = e.data || {};
  try {
    const raw = await runSession(session, (m) => self.postMessage({ id, progress: m }));
    self.postMessage({ id, raw });
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};
