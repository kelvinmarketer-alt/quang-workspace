-- Quang Workspace — KHO TÀI LIỆU cho THÀNH VIÊN (09/11/2026): cấp ở Cài đặt → Người dùng & phân quyền → "Kho tài liệu" (Không / Xem).
-- Chạy 1 lần trong SQL Editor của Supabase SAU SETUP-LIBRARY.sql (+ SETUP-MEMBER-SCOPE.sql đã chạy trước đó). Chỉ THÊM, không đụng dữ liệu.
-- Thành viên CHỈ ĐỌC: không có policy ghi → không tải lên / sửa / xoá được dù gọi thẳng API. Hỏi đáp AI (bảng vector) vẫn chỉ chủ.
-- Thành viên bị giới hạn phạm vi dự án → chỉ đọc tài liệu có customer_id thuộc khách được giao (tài liệu không gắn khách thì không thấy).

-- Các quyền kho tài liệu mà tài khoản đang đăng nhập (theo email) được chủ cấp: [(chủ, bị giới hạn phạm vi?, các khách được giao)]
create or replace function public.qws_lib_member_grants()
returns table(owner uuid, scoped boolean, custs text[])
language plpgsql stable security definer set search_path = public as $$
declare e text := lower(coalesce(auth.jwt()->>'email', '')); r record; m jsonb; a jsonb;
begin
  if e = '' then return; end if;
  for r in
    select w.user_id as uid, w.data as d from public.qws_workspaces w
     where exists (select 1 from jsonb_array_elements(coalesce(w.data->'members', '[]'::jsonb)) x where lower(x->>'email') = e)
  loop
    select x into m from jsonb_array_elements(coalesce(r.d->'members', '[]'::jsonb)) x where lower(x->>'email') = e limit 1;
    a := public.qws_member_acc(m);
    if coalesce(a->>'library', 'none') in ('view', 'edit') then
      owner := r.uid;
      scoped := (a ? '_scope') and jsonb_typeof(a->'_scope') = 'array';
      custs := case when scoped then array(select jsonb_array_elements_text(a->'_scope')) else '{}'::text[] end;
      return next;
    end if;
  end loop;
end $$;
revoke execute on function public.qws_lib_member_grants() from anon, public;
grant execute on function public.qws_lib_member_grants() to authenticated;

-- Tài liệu: thành viên không giới hạn → mọi tài liệu của chủ; có giới hạn → chỉ tài liệu gắn khách được giao
-- (2 điều kiện đều là truy vấn con không phụ thuộc từng dòng → Postgres chạy 1 lần, không đọc lại dữ liệu workspace theo từng tài liệu)
drop policy if exists "members read docs all" on public.qws_lib_docs;
create policy "members read docs all" on public.qws_lib_docs for select to authenticated
  using (user_id in (select g.owner from public.qws_lib_member_grants() g where not g.scoped));
drop policy if exists "members read docs scoped" on public.qws_lib_docs;
create policy "members read docs scoped" on public.qws_lib_docs for select to authenticated
  using (customer_id is not null
         and user_id in (select g.owner from public.qws_lib_member_grants() g where g.scoped)
         and customer_id in (select unnest(g.custs) from public.qws_lib_member_grants() g where g.scoped));

-- Thư mục: chỉ ĐỌC tên thư mục (để duyệt cây) cho mọi thành viên được cấp
drop policy if exists "members read folders" on public.qws_lib_folders;
create policy "members read folders" on public.qws_lib_folders for select to authenticated
  using (user_id in (select g.owner from public.qws_lib_member_grants() g));

-- Tìm trong nội dung: bỏ điều kiện user_id = auth.uid() (RLS đã lọc đúng: chủ thấy của chủ, thành viên thấy phần được cấp)
create or replace function public.qws_lib_search(q text)
returns table(id uuid, snippet text)
language sql stable security invoker set search_path = public, extensions as $$
  with k as (select lower(unaccent(btrim(q))) as s)
  select d.id,
         substr(d.plain, greatest(position(k.s in lower(unaccent(d.plain))) - 60, 1), 200) as snippet
    from public.qws_lib_docs d, k
   where length(k.s) >= 2
     and position(k.s in lower(unaccent(d.plain))) > 0
   order by d.updated_at desc
   limit 60;
$$;
revoke execute on function public.qws_lib_search(text) from anon, public;
grant execute on function public.qws_lib_search(text) to authenticated;
