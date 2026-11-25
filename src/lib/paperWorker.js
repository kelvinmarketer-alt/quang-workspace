// Chạy bot demo trong LUỒNG RIÊNG (Web Worker) — tải + tính toán hàng chục nghìn nến không làm đơ giao diện.
// 25/11: phiên "Demo B (thử)" (session.lab) chạy bằng bản sao paperBotLab.js (38 mã) — bot thật không dùng bản này.
import { runSession } from "./paperBot.js";
import { runSession as runLab } from "./paperBotLab.js"; // nạp tĩnh: worker dạng iife không tách được chunk
self.onmessage = async (e) => {
  const { id, session } = e.data || {};
  try {
    const run = session?.lab ? runLab : runSession;
    const raw = await run(session, (m) => self.postMessage({ id, progress: m }));
    self.postMessage({ id, raw });
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};
