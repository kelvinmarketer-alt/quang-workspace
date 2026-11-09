-- Quang Workspace — LINK LỊCH ĐĂNG KÝ cho Lịch iPhone / Google Calendar (09/11/2026). Chạy 1 lần trong SQL Editor.
-- Chỉ THÊM MỚI (1 bảng) — không đụng dữ liệu cũ. Cách hoạt động:
--  • App (khi chủ mở và có thay đổi) tự tạo nội dung lịch (định dạng ICS) rồi lưu vào bảng này.
--  • Hàm máy chủ qws-ical đọc bảng này theo "mã bí mật" trong link và trả về cho điện thoại. Không ai đọc được nếu không có link.
-- Mỗi người chỉ có 1 dòng (khoá chính = user_id). Chỉ chính chủ đọc/ghi qua RLS; hàm máy chủ đọc bằng quyền service role.

create table if not exists public.qws_ical_feeds (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) >= 24),
  options jsonb not null default '{}'::jsonb,
  ics text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.qws_ical_feeds enable row level security;
drop policy if exists "own ical feed" on public.qws_ical_feeds;
create policy "own ical feed" on public.qws_ical_feeds for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.qws_ical_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists qws_ical_feeds_touch on public.qws_ical_feeds;
create trigger qws_ical_feeds_touch before update on public.qws_ical_feeds
  for each row execute function public.qws_ical_touch();
