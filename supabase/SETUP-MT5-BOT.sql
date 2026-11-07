-- 07/11/2026: bảng theo dõi EA MT5 QWS_Gop (máy bàn Windows, tài khoản demo IC Markets).
-- Cầu nối C:\mt5-research\bridge\mt5_bridge.py ghi bằng service key: dòng 'status' (~30 giây) + 'history' (lịch sử lệnh).
-- App ghi dòng 'command' ({"stop": true|false}) → cầu nối chuyển cho EA (file MQL5\Files\qws_gop_cmd.txt).
-- Chỉ CHỦ workspace (public.qws_is_owner()) đọc + gửi lệnh — giống qws_live_bot.
create table if not exists public.qws_mt5_bot (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.qws_mt5_bot enable row level security;
drop policy if exists "owner read" on public.qws_mt5_bot;
create policy "owner read" on public.qws_mt5_bot for select to authenticated
  using (public.qws_is_owner());
drop policy if exists "owner command" on public.qws_mt5_bot;
create policy "owner command" on public.qws_mt5_bot for all to authenticated
  using (id = 'command' and public.qws_is_owner())
  with check (id = 'command' and public.qws_is_owner());
