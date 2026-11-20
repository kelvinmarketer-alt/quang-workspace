-- Quang Workspace — SỨC KHOẺ (20/11/2026): bảng dữ liệu riêng từng người + lịch nhắc 15 phút một lần.
-- Chạy 1 lần trong SQL Editor. Chạy lại không sao (đều có "if not exists" / gỡ lịch cũ trước khi đặt).

-- 1) Bảng: mỗi người vài dòng nhỏ. k = 'cfg' (cài đặt, lịch tập, món tự thêm) · 'd:YYYY-MM-DD' (nước, bữa ăn, cân, buổi tập của ngày)
--    · 'rs' (dấu "đã nhắc", chỉ máy chủ ghi).
create table if not exists public.qws_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  k text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);
create index if not exists qws_health_k_idx on public.qws_health(k);
alter table public.qws_health enable row level security;
drop policy if exists "own health" on public.qws_health;
create policy "own health" on public.qws_health
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Lịch nhắc: 15 phút một lần, chỉ từ 6h tới 23h giờ VN (23h–16h UTC). Gọi hàm qws-health-remind (tạo hàm TRƯỚC, tắt Verify JWT).
--    Hàm tự chống gửi trùng nên không cần khoá bí mật ở đây.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('qws-health-remind') where exists (select 1 from cron.job where jobname = 'qws-health-remind');
select cron.schedule('qws-health-remind', '*/15 23,0-16 * * *', $$
  select net.http_post(
    url := 'https://dbfffwtnxhytcoczhxhf.supabase.co/functions/v1/qws-health-remind',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) where exists (select 1 from public.qws_health where k = 'cfg');
$$);
