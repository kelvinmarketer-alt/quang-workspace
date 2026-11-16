// 16/11/2026 gộp Văn phòng AI vào Quang Workspace: tài khoản CHỈ thuộc Văn phòng AI (nhân viên, tài khoản phụ, khách của văn phòng)
// mở boss.2bkin.io.vn → chuyển vào /van-phong/, KHÔNG tạo Workspace trống cho họ (trước đây họ thấy 1 Workspace rỗng của riêng mình).
// Dữ liệu của chủ vẫn được máy chủ chặn (RLS + qws_member_load chỉ trả phần được cấp); đây chỉ là chặn ở giao diện cho đỡ rối.
// Lỗi mạng ở bất kỳ bước nào → trả false (giữ cách cũ, không chặn nhầm chủ).
import { supabase, WORKSPACE_TABLE } from "./supabase.js";

const has = (r) => !r.error && (Array.isArray(r.data) ? r.data.length > 0 : !!r.data);

export async function officeOnlyAccount(uid) {
  const own = await supabase.from(WORKSPACE_TABLE).select("user_id").eq("user_id", uid).maybeSingle();
  if (own.error || own.data) return false; // chủ Workspace (hoặc lỗi → không chặn)
  const shared = await supabase.rpc("qws_member_load");
  if (shared.error || has(shared)) return false; // thành viên Workspace
  for (const ask of [() => supabase.rpc("office_my_membership"), () => supabase.rpc("office_staff_me"), () => supabase.from("office_clients").select("id").limit(1)]) {
    const r = await ask();
    if (r.error) return false;
    if (has(r)) return true;
  }
  return false;
}
