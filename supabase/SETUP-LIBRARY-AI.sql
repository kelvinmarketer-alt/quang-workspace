-- Quang Workspace — KHO TÀI LIỆU: HỎI ĐÁP BẰNG AI (09/11/2026). Chạy SAU file SETUP-LIBRARY.sql, 1 lần trong SQL Editor.
-- Chỉ THÊM MỚI (cột, bảng, hàm) — không xoá/sửa dữ liệu tài liệu đã có.
-- Cách hoạt động: mỗi tài liệu được cắt thành các đoạn nhỏ; mỗi đoạn được đổi thành 1 dãy số mô tả ý nghĩa (vector, 1536 chiều).
-- Khi hỏi, câu hỏi cũng được đổi thành dãy số, hàm qws_lib_match tìm các đoạn gần nghĩa nhất để đưa cho AI trả lời.

-- pgvector: phần mở rộng lưu và so sánh vector
create extension if not exists vector with schema extensions;

-- 1) Đánh dấu tài liệu đã "nạp vào hỏi đáp" chưa (null = chưa nạp hoặc nội dung đã đổi sau lần nạp)
alter table public.qws_lib_docs add column if not exists indexed_at timestamptz;

-- Sửa nội dung → tự gỡ dấu "đã nạp" (phải nạp lại). Chỉ đổi dấu "đã nạp" thì KHÔNG tính là cập nhật tài liệu (giữ nguyên ngày sửa).
create or replace function public.qws_lib_touch() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'indexed_at' - 'updated_at') = (to_jsonb(old) - 'indexed_at' - 'updated_at') then
    new.updated_at := old.updated_at;
    return new;
  end if;
  if new.plain is distinct from old.plain then new.indexed_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

-- 2) CÁC ĐOẠN VĂN + VECTOR. Xoá tài liệu → các đoạn của nó tự xoá theo.
create table if not exists public.qws_lib_chunks (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_id uuid not null references public.qws_lib_docs(id) on delete cascade,
  idx integer not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);
create index if not exists qws_lib_chunks_doc_idx on public.qws_lib_chunks(doc_id, idx);
create index if not exists qws_lib_chunks_user_idx on public.qws_lib_chunks(user_id);

alter table public.qws_lib_chunks enable row level security;

-- "Tài liệu này có phải của tôi không" — security definer để policy không tự gọi vòng lại bảng đang bảo vệ
create or replace function public.qws_lib_owns_doc(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qws_lib_docs d where d.id = did and d.user_id = auth.uid());
$$;
revoke execute on function public.qws_lib_owns_doc(uuid) from anon, public;
grant execute on function public.qws_lib_owns_doc(uuid) to authenticated;

drop policy if exists "own chunks" on public.qws_lib_chunks;
create policy "own chunks" on public.qws_lib_chunks for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.qws_lib_owns_doc(doc_id));

-- 3) TÌM CÁC ĐOẠN GẦN NGHĨA NHẤT. folder_ids = chỉ tìm trong các thư mục này (null = cả kho); only_doc = chỉ 1 tài liệu.
--    security invoker → vẫn chịu RLS; similarity càng gần 1 càng giống nghĩa.
create or replace function public.qws_lib_match(
  query_embedding extensions.vector(1536),
  folder_ids uuid[] default null,
  only_doc uuid default null,
  match_count integer default 8
) returns table(doc_id uuid, doc_title text, folder_id uuid, idx integer, content text, similarity double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select c.doc_id, d.title, d.folder_id, c.idx, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
    from public.qws_lib_chunks c
    join public.qws_lib_docs d on d.id = c.doc_id
   where c.user_id = auth.uid()
     and (folder_ids is null or d.folder_id = any(folder_ids))
     and (only_doc is null or c.doc_id = only_doc)
   order by c.embedding <=> query_embedding
   limit least(greatest(match_count, 1), 20);
$$;
revoke execute on function public.qws_lib_match(extensions.vector, uuid[], uuid, integer) from anon, public;
grant execute on function public.qws_lib_match(extensions.vector, uuid[], uuid, integer) to authenticated;
