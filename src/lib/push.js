// Web Push nền cho Quang Workspace.
// Khoá VAPID PUBLIC — an toàn để lộ (client cần nó để subscribe). Private nằm ở Edge Function.
import { supabase } from "./supabase.js";

const VAPID_PUBLIC = "BOOghotwioP-nO0Xs2a_84xcUkT7tzaPtruF11h3vGjfXv_pX2sMt_bYnFak5b4G9XSVW-2EwXwjb0dIH7hh2t8";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function permission() {
  return typeof Notification !== "undefined" ? Notification.permission : "denied";
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch { return null; }
}

export async function isSubscribed() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}

// Bật: xin quyền → subscribe → lưu vào Supabase (theo user hiện tại)
export async function enablePush(userId) {
  if (!pushSupported()) throw new Error("Trình duyệt/thiết bị không hỗ trợ thông báo đẩy.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Bạn chưa cho phép thông báo (kiểm tra cài đặt trình duyệt).");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW());
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) });
  }
  const json = sub.toJSON();
  const { error } = await supabase.from("qws_push_subs").upsert({ endpoint: json.endpoint, user_id: userId, sub: json, ua: navigator.userAgent });
  if (error) throw new Error("Lưu đăng ký thất bại: " + error.message);
  return true;
}

// Tắt: huỷ subscription + xoá khỏi Supabase
export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const ep = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from("qws_push_subs").delete().eq("endpoint", ep);
  }
}

// Gửi thử tới chính mình (gọi Edge Function)
export async function sendTest(userId) {
  const { data, error } = await supabase.functions.invoke("qws-send-push", {
    body: { user_id: userId, title: "Quang Workspace", body: "🔔 Thông báo đẩy đã hoạt động!", url: "/", tag: "test" },
  });
  if (error) throw error;
  return data;
}
