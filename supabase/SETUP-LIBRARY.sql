-- Quang Workspace — KHO TÀI LIỆU (09/11/2026): thư mục + tài liệu (HTML / Markdown / văn bản) + tìm trong nội dung.
-- Chạy 1 lần trong SQL Editor của Supabase. Chỉ THÊM MỚI (bảng, hàm), không đụng dữ liệu cũ.
-- Mọi dữ liệu CHỈ CHÍNH CHỦ thấy (RLS: auth.uid() = user_id). Thành viên khác không đọc/ghi được.

-- Bỏ dấu tiếng Việt khi tìm ("quan ly" tìm ra "quản lý")
create extension if not exists unaccent with schema extensions;

-- 1) THƯ MỤC (lồng nhau được: parent_id)
create table if not exists public.qws_lib_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.qws_lib_folders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'indigo',
  created_at timestamptz not null default now()
);
create index if not exists qws_lib_folders_user_idx on public.qws_lib_folders(user_id, parent_id);

-- 2) TÀI LIỆU. content = file gốc; plain = chữ thuần (đã bỏ thẻ HTML) để tìm kiếm + hỏi đáp sau này.
--    Xoá thư mục → tài liệu bên trong KHÔNG mất, chuyển về "Chưa phân loại" (folder_id = null).
create table if not exists public.qws_lib_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references public.qws_lib_folders(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null check (kind in ('html', 'md', 'txt')),
  content text not null,
  plain text not null default '',
  excerpt text generated always as (left(plain, 220)) stored,
  size_bytes integer not null default 0,
  tags text[] not null default '{}',
  note text not null default '',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qws_lib_docs_user_idx on public.qws_lib_docs(user_id, folder_id, updated_at desc);

create or replace function public.qws_lib_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists qws_lib_docs_touch on public.qws_lib_docs;
create trigger qws_lib_docs_touch before update on public.qws_lib_docs
  for each row execute function public.qws_lib_touch();

-- 3) PHÂN QUYỀN: chỉ chủ; thư mục cha / thư mục chứa phải cũng của chính mình
alter table public.qws_lib_folders enable row level security;
alter table public.qws_lib_docs enable row level security;

-- Hàm phụ "thư mục này có phải của tôi không". PHẢI là security definer: nếu policy tự truy vấn lại chính bảng
-- đang bảo vệ thì Postgres báo "infinite recursion detected in policy" (lỗi này đã gặp khi thử trên bản sao).
create or replace function public.qws_lib_owns_folder(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qws_lib_folders f where f.id = fid and f.user_id = auth.uid());
$$;
revoke execute on function public.qws_lib_owns_folder(uuid) from anon, public;
grant execute on function public.qws_lib_owns_folder(uuid) to authenticated;

drop policy if exists "own folders" on public.qws_lib_folders;
create policy "own folders" on public.qws_lib_folders for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (parent_id is null or public.qws_lib_owns_folder(parent_id)));

drop policy if exists "own docs" on public.qws_lib_docs;
create policy "own docs" on public.qws_lib_docs for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (folder_id is null or public.qws_lib_owns_folder(folder_id)));

-- 4) TÌM TRONG NỘI DUNG (không phân biệt hoa thường + dấu). Trả mã tài liệu + đoạn trích quanh chỗ khớp.
--    security invoker → vẫn chịu RLS; thêm điều kiện user_id cho chắc.
create or replace function public.qws_lib_search(q text)
returns table(id uuid, snippet text)
language sql stable security invoker set search_path = public, extensions as $$
  with k as (select lower(unaccent(btrim(q))) as s)
  select d.id,
         substr(d.plain, greatest(position(k.s in lower(unaccent(d.plain))) - 60, 1), 200) as snippet
    from public.qws_lib_docs d, k
   where length(k.s) >= 2
     and d.user_id = auth.uid()
     and position(k.s in lower(unaccent(d.plain))) > 0
   order by d.updated_at desc
   limit 60;
$$;
revoke execute on function public.qws_lib_search(text) from anon, public;
grant execute on function public.qws_lib_search(text) to authenticated;
