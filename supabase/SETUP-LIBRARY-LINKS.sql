-- Quang Workspace — KHO TÀI LIỆU: GẮN TÀI LIỆU VỚI KHÁCH / DỰ ÁN + Ý HAY MỖI NGÀY (09/11/2026). Chạy SAU SETUP-LIBRARY.sql và SETUP-LIBRARY-AI.sql, 1 lần.
-- Chỉ THÊM MỚI (2 cột, 1 chỉ mục, 1 hàm) và nâng hàm tìm đoạn gần nghĩa để hỏi AI "trong phạm vi tài liệu của 1 khách". Không xoá dữ liệu.
-- customer_id / project_id là mã khách / dự án trong khối dữ liệu của app (dạng chữ, vd "c123") — không có khoá ngoại vì khách nằm trong khối JSON chung.

alter table public.qws_lib_docs add column if not exists customer_id text;
alter table public.qws_lib_docs add column if not exists project_id text;
create index if not exists qws_lib_docs_customer_idx on public.qws_lib_docs(user_id, customer_id);

-- Hàm tìm đoạn gần nghĩa: thêm tham số doc_ids (chỉ tìm trong các tài liệu này). Hàm cũ (4 tham số) bị thay; lời gọi cũ vẫn chạy vì tham số mới có mặc định.
drop function if exists public.qws_lib_match(extensions.vector, uuid[], uuid, integer);
create or replace function public.qws_lib_match(
  query_embedding extensions.vector(1536),
  folder_ids uuid[] default null,
  only_doc uuid default null,
  match_count integer default 8,
  doc_ids uuid[] default null
) returns table(doc_id uuid, doc_title text, folder_id uuid, idx integer, content text, similarity double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select c.doc_id, d.title, d.folder_id, c.idx, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
    from public.qws_lib_chunks c
    join public.qws_lib_docs d on d.id = c.doc_id
   where c.user_id = auth.uid()
     and (folder_ids is null or d.folder_id = any(folder_ids))
     and (only_doc is null or c.doc_id = only_doc)
     and (doc_ids is null or c.doc_id = any(doc_ids))
   order by c.embedding <=> query_embedding
   limit least(greatest(match_count, 1), 20);
$$;
revoke execute on function public.qws_lib_match(extensions.vector, uuid[], uuid, integer, uuid[]) from anon, public;
grant execute on function public.qws_lib_match(extensions.vector, uuid[], uuid, integer, uuid[]) to authenticated;

-- Chọn 1 đoạn văn cho "Ý hay mỗi ngày": ngẫu nhiên nhưng CỐ ĐỊNH theo seed (vd ngày hôm nay) nên app và thông báo 7h sáng cùng ra 1 đoạn.
-- Chỉ lấy đoạn đủ dài (mặc định ≥ 250 ký tự) để có nội dung đáng đọc. security invoker → chỉ thấy đoạn của chính mình.
create or replace function public.qws_lib_pick_chunk(seed text, min_len integer default 250)
returns table(doc_id uuid, doc_title text, idx integer, content text)
language sql stable security invoker set search_path = public as $$
  select c.doc_id, d.title, c.idx, c.content
    from public.qws_lib_chunks c
    join public.qws_lib_docs d on d.id = c.doc_id
   where c.user_id = auth.uid() and char_length(c.content) >= min_len
   order by md5(c.id::text || coalesce(seed, ''))
   limit 1;
$$;
revoke execute on function public.qws_lib_pick_chunk(text, integer) from anon, public;
grant execute on function public.qws_lib_pick_chunk(text, integer) to authenticated;
