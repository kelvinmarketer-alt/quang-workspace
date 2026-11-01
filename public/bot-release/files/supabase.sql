-- Bảng trạng thái bot giao dịch (bot ghi bằng service key; CHỈ CHỦ workspace đọc + gửi lệnh Dừng từ app)
create table if not exists public.qws_live_bot (
  id text primary key,            -- 'status' (bot ghi) | 'command' (app ghi: {"stop": true|false})
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.qws_live_bot enable row level security;
-- 01/11/2026: chủ = tài khoản ghi trong public.qws_owner (hàm qws_is_owner — app quang-workspace/supabase/SETUP-SECURITY-0111.sql).
-- (Bản cũ coi "có dòng qws_workspaces" là chủ → ai đăng ký tài khoản cũng gửi được lệnh cho bot.)
-- Không dùng qws_private vì bảng đó chỉ có sau khi chạy SETUP-SECURITY.sql của app (đã chạy bản này trên project 20/10/2026).
drop policy if exists "owner read" on public.qws_live_bot;
create policy "owner read" on public.qws_live_bot for select to authenticated
  using (public.qws_is_owner());
drop policy if exists "owner command" on public.qws_live_bot;
create policy "owner command" on public.qws_live_bot for all to authenticated
  using (id = 'command' and public.qws_is_owner())
  with check (id = 'command' and public.qws_is_owner());

-- 01/11/2026: thành viên KHÔNG còn xem bot thật (có tiền thật) — chỉ chủ.
drop policy if exists "member read bot" on public.qws_live_bot;
