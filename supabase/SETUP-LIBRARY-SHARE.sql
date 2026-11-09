-- Quang Workspace — CHIA SẺ TÀI LIỆU BẰNG LINK ONLINE (09/11/2026). Chạy 1 lần trong SQL Editor, SAU SETUP-LIBRARY.sql.
-- Chỉ THÊM MỚI (1 bảng + 1 hàm), không đụng dữ liệu cũ.
-- Cách hoạt động: chủ bấm "Chia sẻ" ở tài liệu → app tạo 1 mã bí mật (43 ký tự ngẫu nhiên) lưu vào bảng này →
-- link https://<app>/xem/<mã> mở được KHÔNG cần đăng nhập, chỉ ĐỌC đúng tài liệu đó. Tắt chia sẻ = xoá dòng = link hết hiệu lực ngay.
-- Người ngoài không đọc được bảng; họ chỉ gọi được hàm qws_lib_shared_get(mã) và nhận về 1 tài liệu (tên, loại, nội dung).

create table if not exists public.qws_lib_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_id uuid not null unique references public.qws_lib_docs(id) on delete cascade, -- mỗi tài liệu 1 link
  token text not null unique check (char_length(token) >= 32),
  expires_at timestamptz,                    -- null = không hết hạn
  views integer not null default 0,
  last_view_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists qws_lib_shares_user_idx on public.qws_lib_shares(user_id);

alter table public.qws_lib_shares enable row level security;
drop policy if exists "own shares" on public.qws_lib_shares;
create policy "own shares" on public.qws_lib_shares for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.qws_lib_docs d where d.id = doc_id and d.user_id = auth.uid()));

-- Người xem bên ngoài (chưa đăng nhập) gọi hàm này. security definer = đọc được dù bảng bị khoá; chỉ trả đúng 1 tài liệu theo mã còn hạn.
create or replace function public.qws_lib_shared_get(p_token text)
returns table(title text, kind text, content text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare s public.qws_lib_shares%rowtype;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then return; end if;
  select * into s from public.qws_lib_shares x where x.token = p_token and (x.expires_at is null or x.expires_at > now());
  if not found then return; end if;
  update public.qws_lib_shares x set views = x.views + 1, last_view_at = now() where x.id = s.id;
  return query select d.title, d.kind, d.content, d.updated_at from public.qws_lib_docs d where d.id = s.doc_id;
end $$;
revoke all on function public.qws_lib_shared_get(text) from public;
grant execute on function public.qws_lib_shared_get(text) to anon, authenticated;
