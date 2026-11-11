import { useEffect, useRef } from "react";
import { useData } from "../lib/store.jsx";
import { todayISO, fmtDateVI } from "../lib/format.js";
import { rollNext, newlyDone, dueReminders } from "../lib/taskRepeat.js";

// Chạy nền (không hiện gì), gắn 1 lần cho cả app:
// 1) Việc LẶP LẠI vừa được đánh dấu xong (ở trang Công việc, khung Hôm nay…) → tạo lần kế tiếp.
// 2) NHẮC TRƯỚC GIỜ: việc có giờ + "nhắc trước 10/30/60 phút" → thông báo khi app đang mở.
//    Đã cho phép thông báo → hiện thông báo của máy; chưa cho phép → chỉ hiện thông báo nổi trong app.
//    App đóng hẳn thì KHÔNG nhắc được (cần máy chủ gửi thông báo đẩy theo giờ — chưa có).
const FIRED_KEY = "qws_task_remind_fired";
const loadFired = () => { try { const a = JSON.parse(localStorage.getItem(FIRED_KEY) || "[]"); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); } };
const saveFired = (s) => { try { localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-200))); } catch { /* chế độ riêng tư */ } };

async function sysNotify(title, body, tag) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration?.());
    if (reg?.showNotification) { await reg.showNotification(title, { body, tag, data: { url: "/cong-viec" } }); return true; }
    new Notification(title, { body, tag }); // eslint-disable-line no-new
    return true;
  } catch { return false; }
}

export default function TaskWatch() {
  const { tasks = [], addTask, canEdit, setToast } = useData();
  const prev = useRef(null);
  const latest = useRef(tasks);
  latest.current = tasks;
  const canW = canEdit ? canEdit("tasks") : true;

  // 1) Việc lặp: so trạng thái với lần trước
  useEffect(() => {
    const before = prev.current;
    prev.current = new Map(tasks.map((t) => [t.id, t.status]));
    if (!before || !canW || !addTask) return;
    const made = [];
    let pool = tasks;
    for (const t of newlyDone(before, tasks)) {
      const next = rollNext(t, pool, todayISO());
      if (!next) continue;
      addTask(next);
      pool = [...pool, { ...next, id: "_pending" + made.length }];
      made.push(next);
    }
    if (made.length && setToast) setToast({ text: made.length === 1 ? `Việc lặp lại: đã tạo lần tới ${fmtDateVI(made[0].date)} — "${made[0].title}"` : `Đã tạo lần tới cho ${made.length} việc lặp lại`, at: Date.now() });
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Nhắc trước giờ: soát 30 giây/lần + khi quay lại tab
  useEffect(() => {
    const fired = loadFired();
    const check = async () => {
      const due = dueReminders(latest.current, Date.now(), fired);
      if (!due.length) return;
      due.forEach((d) => fired.add(d.key));
      saveFired(fired);
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      for (const d of due) await sysNotify(`⏰ ${d.time} · ${d.title}`, `Còn ${d.left} phút nữa`, "task-" + d.id);
      if (visible && setToast) setToast({ text: due.length === 1 ? `⏰ Còn ${due[0].left} phút: ${due[0].title} (${due[0].time})` : `⏰ Sắp tới giờ ${due.length} việc: ${due.map((d) => `${d.time} ${d.title}`).join(" · ")}`, at: Date.now() });
    };
    check();
    const t = setInterval(check, 30000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
