// Kết nối Văn phòng AI (office.2bkin.io.vn) — chung Supabase + tài khoản. Bảng office_* chỉ chủ tài khoản thấy (RLS).
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export const OFFICE_URL = "https://office.2bkin.io.vn";
export const OFFICE_AGENTS = [
  { id: "00-truong-phong", name: "Trưởng phòng", emoji: "👔" },
  { id: "01-ads", name: "NV Ads", emoji: "📊" },
  { id: "02-seo-content", name: "NV SEO/Content", emoji: "✍️" },
  { id: "07-video", name: "NV Video", emoji: "🎬" },
  { id: "03-dev", name: "NV Dev", emoji: "💻" },
  { id: "04-bao-cao", name: "NV Báo cáo", emoji: "📈" },
  { id: "05-ke-toan", name: "NV Kế toán", emoji: "💰" },
  { id: "06-nhan-su", name: "NV Nhân sự", emoji: "👥" },
  { id: "10-chien-luoc", name: "NV Chiến lược", emoji: "🧭" },
  { id: "08-sang-tao", name: "NV Sáng tạo", emoji: "💡" },
  { id: "09-phan-tich", name: "NV Phân tích TT", emoji: "📉" },
  { id: "11-chien-luoc-mkt", name: "NV Chiến lược MKT", emoji: "🎯" },
];
export const OFFICE_KINDS = [
  { k: "can_duyet", label: "Việc cần sếp duyệt", emoji: "🟡" },
  { k: "xong", label: "Việc đã xong", emoji: "✅" },
  { k: "loi", label: "Việc bị lỗi", emoji: "🔴" },
  { k: "tin_nhan", label: "Nhân viên trả lời tin nhắn", emoji: "💬" },
  { k: "he_thong", label: "Thông báo hệ thống", emoji: "⚙️" },
];
// Khớp DEFAULT_KINDS của runner
export const DEFAULT_OFFICE_PREFS = {
  push: true,
  kinds: { xong: true, can_duyet: true, loi: true, tin_nhan: false, he_thong: true },
  mute_agents: [],
  quiet: { on: false, from: "22:00", to: "07:00" },
};

// Ai được vào Văn phòng AI: chủ, hoặc tài khoản phụ đã được chủ thêm (bảng office_members)
export function useOfficeAccess(isOwner) {
  const [ok, setOk] = useState(!!isOwner);
  useEffect(() => {
    if (isOwner) { setOk(true); return; }
    let alive = true;
    supabase.rpc("office_my_membership").then(({ data }) => { if (alive) setOk(!!data?.length); });
    return () => { alive = false; };
  }, [isOwner]);
  return ok;
}

export const DEFAULT_MEMBER_PERMS = { agents: [], approve: false, chat: true, view_costs: false, see_all: false };
export const MEMBER_FLAGS = [
  { k: "chat", label: "Được nhắn tin riêng với nhân viên" },
  { k: "approve", label: "Được bấm Duyệt đề xuất" },
  { k: "see_all", label: "Thấy toàn bộ việc của văn phòng" },
  { k: "view_costs", label: "Xem trang Hiệu suất & chi phí" },
];
export async function loadOfficeMembers() {
  const { data, error } = await supabase.from("office_members").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return data || [];
}
export async function saveOfficeMember(ownerId, m) {
  const { error } = await supabase.from("office_members").upsert({
    owner_id: ownerId, email: m.email.trim().toLowerCase(), name: m.name || null,
    perms: { ...DEFAULT_MEMBER_PERMS, ...(m.perms || {}) }, active: m.active !== false,
  }, { onConflict: "owner_id,email" });
  if (error) throw new Error(error.message);
}
export async function deleteOfficeMember(ownerId, email) {
  const { error } = await supabase.from("office_members").delete().eq("owner_id", ownerId).eq("email", email);
  if (error) throw new Error(error.message);
}

export function useOfficeNotifications(enabled, ownerView = true) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      let q = supabase.from("office_notifications")
        .select("id,kind,title,body,url,read_at,created_at,agent_id").order("created_at", { ascending: false }).limit(15);
      if (ownerView) q = q.is("target_uid", null); // bản sao gửi riêng tài khoản phụ không hiện lặp ở chuông của chủ
      const { data } = await q;
      if (alive) setRows(data || []);
    };
    load();
    const ch = supabase.channel("qws-office-notif")
      .on("postgres_changes", { event: "*", schema: "public", table: "office_notifications" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [enabled, ownerView]);
  const markRead = async (ids) => {
    if (!ids.length) return;
    const at = new Date().toISOString();
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, read_at: at } : r)));
    await supabase.from("office_notifications").update({ read_at: at }).in("id", ids);
  };
  return { rows, unread: rows.filter((r) => !r.read_at).length, markRead };
}

export async function loadOfficePrefs() {
  const { data } = await supabase.from("office_settings").select("prefs").maybeSingle();
  const p = data?.prefs || {};
  return { ...DEFAULT_OFFICE_PREFS, ...p, kinds: { ...DEFAULT_OFFICE_PREFS.kinds, ...(p.kinds || {}) }, quiet: { ...DEFAULT_OFFICE_PREFS.quiet, ...(p.quiet || {}) } };
}
export async function saveOfficePrefs(userId, prefs) {
  const { error } = await supabase.from("office_settings").upsert({ owner_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
  if (error) throw new Error(error.message);
}
export async function loadOfficeRunner() {
  const { data } = await supabase.from("office_runner").select("host,last_seen").maybeSingle();
  return data ? { ...data, online: Date.now() - new Date(data.last_seen).getTime() < 90_000 } : null;
}
export function officeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}
