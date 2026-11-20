// SỨC KHOẺ — kho dữ liệu riêng (bảng qws_health, mỗi người vài dòng nhỏ; KHÔNG nằm trong khối dữ liệu chung của app).
// Lý do tách: bấm "uống 1 ly" chỉ gửi 1 dòng vài trăm byte, không phải đẩy lại cả khối chung; máy chủ nhắc cũng đọc bảng này.
// Hiện ngay từ bản nhớ trong máy, rồi chỉ tải các dòng ĐỔI SAU lần đồng bộ trước (tiết kiệm băng thông Supabase).
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase.js";
import { useAuth } from "./auth.jsx";
import { withDefaults, dayKeyOf, uid as rid } from "./health.js";

const TABLE = "qws_health";
const KEEP_DAYS = 200; // giữ trong máy ~6 tháng gần nhất (đủ vẽ biểu đồ); bản đầy đủ vẫn nằm trên máy chủ
const cacheKey = (u) => `qws-cache:health:${u}`; // tiền tố qws-cache: → tự xoá khi đăng xuất (auth.jsx)

let S = { uid: null, cfg: null, days: {}, sync: "", dirty: [], ready: false, cloud: "idle" }; // cloud: idle | saving | ok | error | off (chưa tạo bảng)
const subs = new Set();
let saveTimer = null, loading = null, lastPull = 0, retries = 0;

function persist() {
  if (!S.uid) return;
  try { localStorage.setItem(cacheKey(S.uid), JSON.stringify({ cfg: S.cfg, days: S.days, sync: S.sync, dirty: S.dirty })); } catch { /* đầy bộ nhớ → bỏ qua */ }
}
function set(patch, keep = true) { S = { ...S, ...patch }; if (keep) persist(); subs.forEach((f) => f()); }
function trimDays(days) {
  const min = dayKeyOf(Date.now() - KEEP_DAYS * 86400000);
  const out = {}; for (const k of Object.keys(days)) if (k >= min) out[k] = days[k];
  return out;
}

// Hai máy cùng sửa 1 ngày: gộp thay vì đè. Nước gộp theo thời điểm uống, bữa ăn gộp theo id; số đơn (cân, eo, bước, buổi tập) lấy bản trong máy nếu có.
export function mergeDay(local, remote) {
  if (!remote) return local; if (!local) return remote;
  const byKey = (a, b, key) => { const m = new Map(); for (const x of [...(b || []), ...(a || [])]) m.set(key(x), x); return [...m.values()].sort((x, y) => (x.t || 0) - (y.t || 0)); };
  const out = { ...remote, ...local };
  if (local.water || remote.water) out.water = byKey(local.water, remote.water, (w) => `${w.t}:${w.ml}`);
  if (local.meals || remote.meals) out.meals = byKey(local.meals, remote.meals, (m) => m.id);
  if (!local.gym && remote.gym) out.gym = remote.gym;
  return out;
}

async function pull() {
  const u = S.uid; if (!u) return;
  let q = supabase.from(TABLE).select("k, data, updated_at").eq("user_id", u).neq("k", "rs");
  q = S.sync ? q.gt("updated_at", S.sync) : q.or(`k.eq.cfg,k.gte."d:${dayKeyOf(Date.now() - KEEP_DAYS * 86400000)}"`);
  const { data, error } = await q;
  if (u !== S.uid) return;
  if (error) { set({ ready: true, cloud: /does not exist|schema cache|404/i.test(error.message || "") ? "off" : "error" }, false); return; }
  let cfg = S.cfg, sync = S.sync; const days = { ...S.days };
  for (const r of data || []) {
    if (r.updated_at > sync) sync = r.updated_at;
    const mine = S.dirty.includes(r.k); // máy này đang có bản sửa chưa lưu
    if (r.k === "cfg") { if (!mine) cfg = r.data; } // cấu hình: giữ bản trong máy
    else if (r.k.startsWith("d:")) days[r.k.slice(2)] = mine ? mergeDay(days[r.k.slice(2)], r.data) : r.data; // ngày: gộp cả hai
  }
  lastPull = Date.now();
  set({ cfg, days: trimDays(days), sync, ready: true, cloud: S.dirty.length ? S.cloud : "ok" });
  if (S.dirty.length) flush();
}

function start(u) {
  if (S.uid === u) { refresh(5 * 60000); return; }
  let c = null; try { c = JSON.parse(localStorage.getItem(cacheKey(u)) || "null"); } catch { /* bỏ qua */ }
  S = { uid: u, cfg: c?.cfg || null, days: c?.days || {}, sync: c?.sync || "", dirty: Array.isArray(c?.dirty) ? c.dirty : [], ready: !!c, cloud: "idle" };
  subs.forEach((f) => f());
  loading = pull().finally(() => { loading = null; });
}

// Tải lại phần mới từ máy chủ nếu lần tải trước đã quá `olderThan` ms (mở lại app, quay lại tab)
export function refresh(olderThan = 60000) { if (S.uid && !loading && Date.now() - lastPull > olderThan) loading = pull().finally(() => { loading = null; }); }

export async function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  const u = S.uid, keys = [...S.dirty];
  if (!u || !keys.length || S.cloud === "off") return;
  set({ cloud: "saving" }, false);
  const now = new Date().toISOString();
  const rows = keys.map((k) => ({ user_id: u, k, data: k === "cfg" ? S.cfg || {} : S.days[k.slice(2)] || {}, updated_at: now }));
  const { error } = await supabase.from(TABLE).upsert(rows);
  if (u !== S.uid) return;
  if (error) { set({ cloud: /does not exist|schema cache|404/i.test(error.message || "") ? "off" : "error" }, false); return; }
  retries = 0;
  set({ dirty: S.dirty.filter((k) => !keys.includes(k)), cloud: "ok" });
  if (S.dirty.length) queue();
}
function queue() { retries = 0; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700); }
function touch(k) { return S.dirty.includes(k) ? S.dirty : [...S.dirty, k]; }

// ===== Ghi =====
export function setCfg(fn) { set({ cfg: fn(withDefaults(S.cfg)), dirty: touch("cfg") }); queue(); }
export function setDay(key, fn) { set({ days: { ...S.days, [key]: fn(S.days[key] || {}) }, dirty: touch("d:" + key) }); queue(); }
export const addWater = (ml, key = dayKeyOf(Date.now())) => setDay(key, (d) => ({ ...d, water: [...(d.water || []), { t: Date.now(), ml }] }));
export const undoWater = (key = dayKeyOf(Date.now())) => setDay(key, (d) => ({ ...d, water: (d.water || []).slice(0, -1) }));
export const setWeight = (kg, key = dayKeyOf(Date.now())) => setDay(key, (d) => ({ ...d, weight: kg || undefined }));
export const addMeal = (m, key = dayKeyOf(Date.now())) => setDay(key, (d) => ({ ...d, meals: [...(d.meals || []), { id: "m" + rid(), t: Date.now(), ...m }] }));
export const removeMeal = (id, key) => setDay(key, (d) => ({ ...d, meals: (d.meals || []).filter((m) => m.id !== id) }));
export const setDayField = (field, value, key = dayKeyOf(Date.now())) => setDay(key, (d) => ({ ...d, [field]: value || undefined })); // waist (cm), steps
export const setGym = (key, fn) => setDay(key, (d) => ({ ...d, gym: fn(d.gym || null) || undefined }));

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { if (S.dirty.length) flush(); } else refresh(60000); });
  // Mất mạng lúc ghi: có mạng lại thì tự gửi; còn lỗi thì 30 giây thử lại một lần
  window.addEventListener("online", () => { retries = 0; if (S.dirty.length) flush(); });
  // thử lại thưa dần, tối đa 10 lần liên tiếp (không gọi máy chủ mãi nếu lỗi không phải do mạng); ghi thêm / có mạng lại thì đếm lại
  setInterval(() => { if (S.uid && S.dirty.length && S.cloud === "error" && navigator.onLine !== false && retries < 10) { retries++; flush(); } }, 30000);
}

const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const snap = () => S;
export function useHealth() {
  const { user } = useAuth();
  const s = useSyncExternalStore(subscribe, snap, snap);
  useEffect(() => { if (user?.id) start(user.id); }, [user?.id]);
  const mine = s.uid === user?.id;
  return { ready: mine && s.ready, cloud: s.cloud, rawCfg: mine ? s.cfg : null, cfg: withDefaults(mine ? s.cfg : null), days: mine ? s.days : {}, pending: s.dirty.length };
}
// Cho kiểm thử: đặt lại kho
export function __resetHealth(next) { clearTimeout(saveTimer); S = { uid: null, cfg: null, days: {}, sync: "", dirty: [], ready: false, cloud: "idle", ...(next || {}) }; lastPull = next ? Date.now() : 0; subs.forEach((f) => f()); }
