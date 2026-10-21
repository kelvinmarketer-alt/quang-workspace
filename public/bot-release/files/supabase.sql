-- Bảng trạng thái bot giao dịch (bot ghi bằng service key; CHỈ CHỦ workspace đọc + gửi lệnh Dừng từ app)
create table if not exists public.qws_live_bot (
  id text primary key,            -- 'status' (bot ghi) | 'command' (app ghi: {"stop": true|false})
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.qws_live_bot enable row level security;
-- Chủ workspace = người có dòng trong qws_workspaces (mỗi chủ 1 dòng; tài khoản phụ không có dòng).
-- Không dùng qws_private vì bảng đó chỉ có sau khi chạy SETUP-SECURITY.sql của app (đã chạy bản này trên project 20/10/2026).
drop policy if exists "owner read" on public.qws_live_bot;
create policy "owner read" on public.qws_live_bot for select to authenticated
  using (exists (select 1 from public.qws_workspaces w where w.user_id = auth.uid()));
drop policy if exists "owner command" on public.qws_live_bot;
create policy "owner command" on public.qws_live_bot for all to authenticated
  using (id = 'command' and exists (select 1 from public.qws_workspaces w where w.user_id = auth.uid()))
  with check (id = 'command' and exists (select 1 from public.qws_workspaces w where w.user_id = auth.uid()));

-- (21/10) Thành viên được chủ cấp quyền "Bot thật" (members[].access.coinLive = view) → CHỈ ĐỌC trạng thái + lịch sử.
-- Dòng 'command' (lệnh dừng/đóng, khoá API đã mã hoá) vẫn chỉ chủ đọc/ghi.
drop policy if exists "member read bot" on public.qws_live_bot;
create policy "member read bot" on public.qws_live_bot for select to authenticated
  using (id in ('status', 'history') and exists (
    select 1 from public.qws_workspaces w, jsonb_array_elements(coalesce(w.data->'members', '[]'::jsonb)) m
    where lower(m->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
      and m->'access'->>'coinLive' in ('view', 'edit')));
