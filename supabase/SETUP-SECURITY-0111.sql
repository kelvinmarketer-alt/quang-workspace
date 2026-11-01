-- 01/11/2026 — VÁ LỖ HỔNG QUYỀN (rà soát tổng thể, sếp duyệt). Chạy 1 lần trong Supabase → SQL Editor.
-- Lỗi cũ: các quy tắc coi "có 1 dòng trong qws_workspaces" là CHỦ. Mà ai đăng ký tài khoản cũng được app tự tạo 1 dòng
-- → người lạ gửi được lệnh cho bot TIỀN THẬT (dừng / đóng hết / đổi rủi ro) và đọc trạng thái bot.
-- Sửa: chủ = đúng 1 tài khoản ghi trong bảng qws_owner. Thay __OWNER_UID__ bằng uid tài khoản chủ trước khi chạy.

-- 1) Bảng chủ (không policy → trình duyệt không đọc / sửa được; chỉ hàm security definer + máy chủ)
create table if not exists public.qws_owner (uid uuid primary key);
alter table public.qws_owner enable row level security;
insert into public.qws_owner (uid) values ('__OWNER_UID__') on conflict do nothing;

create or replace function public.qws_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qws_owner where uid = auth.uid())
$$;
revoke execute on function public.qws_is_owner() from anon, public;
grant execute on function public.qws_is_owner() to authenticated;

-- 2) Bot thật: chỉ CHỦ đọc mọi dòng + gửi lệnh; thành viên được cấp "Bot thật" chỉ đọc status/history,
--    và chỉ tính danh sách thành viên trong dòng workspace CỦA CHỦ (trước: dòng nào cũng được → người lạ tự thêm mình)
drop policy if exists "owner read" on public.qws_live_bot;
create policy "owner read" on public.qws_live_bot for select to authenticated using (public.qws_is_owner());
drop policy if exists "owner command" on public.qws_live_bot;
create policy "owner command" on public.qws_live_bot for all to authenticated
  using (id = 'command' and public.qws_is_owner())
  with check (id = 'command' and public.qws_is_owner());
drop policy if exists "member read bot" on public.qws_live_bot;
create policy "member read bot" on public.qws_live_bot for select to authenticated
  using (id in ('status', 'history') and exists (
    select 1 from public.qws_workspaces w
      join public.qws_owner o on o.uid = w.user_id,
      jsonb_array_elements(coalesce(w.data->'members', '[]'::jsonb)) m
    where lower(m->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
      and m->'access'->>'coinLive' in ('view', 'edit')));

-- 3) Thành viên chỉ có quyền "Tổng quan" không còn nhận sổ chi tiêu / quỹ (Tổng quan không dùng các mục này)
--    Vá đúng 1 điều kiện trên bản hàm ĐANG CHẠY (không ghi đè các khoá phiên khác đã thêm)
do $$
declare src text := pg_get_functiondef('public.qws_member_view(jsonb,jsonb)'::regprocedure);
begin
  if position(' or (dash and ids is null)' in src) > 0 then execute replace(src, ' or (dash and ids is null)', ''); end if;
end $$;

-- Kiểm tra sau khi chạy (phải ra 1 dòng, is_owner_fn = true khi chạy bằng tài khoản chủ trên app):
-- select uid from public.qws_owner;
-- select policyname, cmd from pg_policies where tablename = 'qws_live_bot';
