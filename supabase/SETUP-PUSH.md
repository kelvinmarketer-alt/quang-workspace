# Bật Web Push nền cho Quang Workspace

Frontend (SW + đăng ký + UI trong Cài đặt) đã có sẵn. Cần làm 3 bước trên **Supabase dashboard** (project `dbfffwtnxhytcoczhxhf`):

## 1. Tạo bảng lưu subscription — SQL Editor → Run

```sql
create table if not exists public.qws_push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sub jsonb not null,
  ua text,
  created_at timestamptz not null default now()
);
create index if not exists qws_push_subs_user_idx on public.qws_push_subs(user_id);
alter table public.qws_push_subs enable row level security;
drop policy if exists "own push subs" on public.qws_push_subs;
create policy "own push subs" on public.qws_push_subs
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 2. Đặt secrets — Edge Functions → Secrets (hoặc Project Settings → Edge Functions)

- `VAPID_PUBLIC`  = `BOOghotwioP-nO0Xs2a_84xcUkT7tzaPtruF11h3vGjfXv_pX2sMt_bYnFak5b4G9XSVW-2EwXwjb0dIH7hh2t8`
- `VAPID_PRIVATE` = **(khoá bí mật — gửi riêng trong chat, KHÔNG lưu vào repo public)**

(`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` Supabase tự cấp, không cần thêm.)

## 3. Deploy function `qws-send-push`

Dùng code ở `supabase/functions/qws-send-push/index.ts` (dashboard → Edge Functions → Deploy new function → dán code).
Hoặc CLI: `supabase functions deploy qws-send-push`.

## Test
Mở app → Cài đặt → **Thông báo đẩy → Bật** → **Gửi thử tới máy tôi**.
