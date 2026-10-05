-- Quang Workspace — Bảo mật + chống ghi đè + sao lưu + nhật ký AI (chạy 1 lần, SQL Editor). Chỉ THÊM MỚI, không xoá dữ liệu.

-- 1) KHO RIÊNG CỦA CHỦ: Tài khoản & Thẻ + OpenAI key. Chỉ chính chủ đọc/ghi (thành viên KHÔNG thấy).
create table if not exists public.qws_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.qws_private enable row level security;
drop policy if exists "own private" on public.qws_private;
create policy "own private" on public.qws_private for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) CHỐT CHẶN phía server cho khối dữ liệu chung:
--    - đã có kho riêng → luôn gỡ vault + openaiKey khỏi khối chung (kể cả app cũ ghi lại)
--    - thành viên KHÔNG được sửa danh sách thành viên (chống tự nâng quyền)
create or replace function public.qws_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.qws_private p where p.user_id = new.user_id) then
    new.data := (new.data - 'vault');
    if new.data ? 'settings' then
      new.data := jsonb_set(new.data, '{settings}', (new.data->'settings') - 'openaiKey');
    end if;
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and auth.uid() <> old.user_id then
    new.data := jsonb_set(new.data, '{members}', coalesce(old.data->'members', '[]'::jsonb));
  end if;
  return new;
end $$;
drop trigger if exists qws_guard on public.qws_workspaces;
create trigger qws_guard before insert or update on public.qws_workspaces
  for each row execute function public.qws_guard();

-- 3) LƯU CÓ KIỂM TRA PHIÊN BẢN: chỉ ghi khi bản trên cloud chưa bị nơi khác sửa (so updated_at).
--    Trả ok=false + updated_at hiện tại → app tải bản mới, gộp thay đổi rồi lưu lại (không đè mất).
create or replace function public.qws_save(p_owner uuid, p_data jsonb, p_expect timestamptz)
returns table(ok boolean, updated_at timestamptz)
language plpgsql security invoker set search_path = public as $$
declare v timestamptz;
begin
  update public.qws_workspaces w set data = p_data
   where w.user_id = p_owner and w.updated_at = p_expect
   returning w.updated_at into v;
  if found then return query select true, v; return; end if;
  return query select false, (select w.updated_at from public.qws_workspaces w where w.user_id = p_owner);
end $$;
grant execute on function public.qws_save(uuid, jsonb, timestamptz) to authenticated;

-- 4) SAO LƯU tự động mỗi ngày (giữ 30 ngày). Chỉ chủ xem/tải/tạo.
create table if not exists public.qws_backups (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null default 'auto',
  data jsonb not null,
  private jsonb
);
create index if not exists qws_backups_user_idx on public.qws_backups(user_id, created_at desc);
alter table public.qws_backups enable row level security;
drop policy if exists "own backups read" on public.qws_backups;
create policy "own backups read" on public.qws_backups for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own backups insert" on public.qws_backups;
create policy "own backups insert" on public.qws_backups for insert to authenticated with check (auth.uid() = user_id);

create extension if not exists pg_cron;
select cron.unschedule('qws-daily-backup') where exists (select 1 from cron.job where jobname = 'qws-daily-backup');
-- 3h sáng giờ VN (20:00 UTC)
select cron.schedule('qws-daily-backup', '0 20 * * *', $$
  insert into public.qws_backups(user_id, kind, data, private)
    select w.user_id, 'auto', w.data, p.data from public.qws_workspaces w left join public.qws_private p using (user_id);
  delete from public.qws_backups where created_at < now() - interval '30 days';
$$);
-- Bản sao lưu đầu tiên ngay bây giờ
insert into public.qws_backups(user_id, kind, data, private)
  select w.user_id, 'auto', w.data, p.data from public.qws_workspaces w left join public.qws_private p using (user_id);

-- 5) NHẬT KÝ CHI PHÍ AI (edge function qws-ai ghi bằng service role; chủ xem).
create table if not exists public.qws_ai_usage (
  id bigserial primary key,
  owner_id uuid not null,
  actor_email text,
  feature text,
  model text,
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(10,6),
  created_at timestamptz not null default now()
);
create index if not exists qws_ai_usage_owner_idx on public.qws_ai_usage(owner_id, created_at desc);
alter table public.qws_ai_usage enable row level security;
drop policy if exists "owner reads ai usage" on public.qws_ai_usage;
create policy "owner reads ai usage" on public.qws_ai_usage for select to authenticated using (auth.uid() = owner_id);
