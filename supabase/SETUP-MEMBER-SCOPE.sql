-- QWS · CHẶN DỮ LIỆU THEO QUYỀN Ở MÁY CHỦ (22/10/2026). Chạy 1 lần ở SQL Editor. Không xoá / sửa dữ liệu.
-- Trước đây: tài khoản phụ đọc + ghi THẲNG cả khối dữ liệu của chủ (policy "members read/update workspace") → giao diện ẩn,
-- nhưng mở công cụ trình duyệt vẫn đọc được quỹ, chi phí, tài nguyên (mật khẩu khách)…
-- Sau khi chạy: tài khoản phụ CHỈ đọc qua qws_member_load() (máy chủ đã lọc theo quyền + phạm vi dự án),
-- và CHỈ ghi qua qws_member_save() (máy chủ chỉ nhận phần được quyền Sửa, trong phạm vi được giao; phần khác giữ nguyên).
-- Logic quyền khớp src/lib/permissions.js (memberAccess / memberScope / SCOPE_BLOCKED).

-- 1) Quyền thực của 1 thành viên (kể cả quyền kiểu cũ perms[]) + '_scope' = mảng id khách khi bị giới hạn dự án
create or replace function public.qws_member_acc(m jsonb) returns jsonb language plpgsql immutable as $$
declare a jsonb; f text; feats text[] := array['dashboard','customers','resources','ads','web','fanpage','ketoan','coin','tasks']; sc jsonb := m->'scope';
begin
  if jsonb_typeof(m->'access') = 'object' then a := m->'access';
  else
    a := '{}'::jsonb;
    foreach f in array feats loop a := a || jsonb_build_object(f, case when coalesce(m->'perms', '[]'::jsonb) ? f then 'edit' else 'none' end); end loop;
  end if;
  if a->>'resources' is null then a := a || jsonb_build_object('resources', coalesce(a->>'customers', 'none')); end if;
  foreach f in array feats loop if a->>f is null then a := a || jsonb_build_object(f, 'none'); end if; end loop;
  if a->>'coinInvest' is null then a := a || '{"coinInvest":"none"}'::jsonb; end if;
  if a->>'coinMarket' is null then a := a || jsonb_build_object('coinMarket', case when a->>'coin' <> 'none' then 'view' else 'none' end); end if;
  if a->>'coinDemo' is null then a := a || jsonb_build_object('coinDemo', case when a->>'coin' <> 'none' then 'view' else 'none' end); end if;
  if a->>'coinLive' is null then a := a || '{"coinLive":"none"}'::jsonb; end if;
  if sc is not null and sc->>'all' = 'false' and jsonb_typeof(sc->'customers') = 'array' then
    a := a || '{"ketoan":"none"}'::jsonb || jsonb_build_object('_scope', sc->'customers');
  end if;
  return a;
end $$;

-- Phần tử mảng thuộc (keep=true) / không thuộc (keep=false) các khách ids, so theo trường fld
create or replace function public.qws_scope_arr(arr jsonb, ids jsonb, fld text, keep boolean) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(arr) = 'array' then arr else '[]'::jsonb end) x
  where keep = exists (select 1 from jsonb_array_elements_text(ids) i where i = x->>fld) $$;

-- 2) Bản dữ liệu thành viên được thấy — DANH SÁCH CHO PHÉP (22/10): khoá nào chưa khai báo ở đây thì tài khoản phụ KHÔNG thấy
--    (thêm mục dữ liệu mới trong app → thêm vào đây nếu tài khoản phụ cần thấy). Khớp FEATURES trong src/lib/permissions.js.
create or replace function public.qws_member_view(d jsonb, m jsonb) returns jsonb language plpgsql immutable as $$
declare a jsonb := public.qws_member_acc(m); ids jsonb := a->'_scope'; ds jsonb := coalesce(d->'settings', '{}'::jsonb);
  dash boolean := a->>'dashboard' <> 'none'; keys text[] := array['catsV5']; skeys text[] := array['aiEnabled', 'openaiModel']; r jsonb; s jsonb;
begin
  if a->>'customers' <> 'none' or dash then keys := keys || array['customerList', 'projects']; end if;
  if a->>'resources' <> 'none' then keys := keys || array['resources']; end if;
  if a->>'ketoan' <> 'none' or (dash and ids is null) then keys := keys || array['expenses', 'funds', 'fundTx', 'fundSchedules', 'spendCats', 'transactions']; end if;
  if a->>'tasks' <> 'none' or dash then keys := keys || array['tasks', 'family']; end if;
  if a->>'coinInvest' <> 'none' then keys := keys || array['coins']; skeys := skeys || array['coinDeposits']; end if;
  if a->>'coinDemo' <> 'none' or a->>'coinLive' <> 'none' then skeys := skeys || array['paperBot', 'paperBotLog']; end if;
  if a->>'ads' <> 'none' then keys := keys || array['adsResults']; end if;
  select coalesce(jsonb_object_agg(k, d->k), '{}'::jsonb) into r from unnest(keys) k where d ? k;
  select coalesce(jsonb_object_agg(k, ds->k), '{}'::jsonb) into s from unnest(skeys) k where ds ? k;
  if ids is not null then -- giới hạn dự án: chỉ khách được giao + dự án / tài nguyên của họ
    if r ? 'customerList' then r := r || jsonb_build_object('customerList', public.qws_scope_arr(d->'customerList', ids, 'id', true)); end if;
    if r ? 'projects' then r := r || jsonb_build_object('projects', public.qws_scope_arr(d->'projects', ids, 'customerId', true)); end if;
    if r ? 'resources' then r := r || jsonb_build_object('resources', public.qws_scope_arr(d->'resources', ids, 'customerId', true)); end if;
  end if;
  return r || jsonb_build_object('members', jsonb_build_array(m), 'settings', s); -- chỉ thấy hồ sơ của chính mình
end $$;

-- 3) Thành viên tải dữ liệu (đã lọc)
create or replace function public.qws_member_load() returns table(user_id uuid, data jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare e text := lower(coalesce(auth.jwt()->>'email', '')); w record; m jsonb;
begin
  if e = '' then return; end if;
  for w in select x.user_id as uid, x.data as d, x.updated_at as at from public.qws_workspaces x where x.user_id <> auth.uid() loop
    select mm into m from jsonb_array_elements(coalesce(w.d->'members', '[]'::jsonb)) mm where lower(mm->>'email') = e limit 1;
    if m is not null then return query select w.uid, public.qws_member_view(w.d, m), w.at; return; end if;
  end loop;
end $$;

create or replace function public.qws_member_head(p_owner uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select w.updated_at from public.qws_workspaces w where w.user_id = p_owner and coalesce(auth.jwt()->>'email', '') <> ''
    and exists (select 1 from jsonb_array_elements(coalesce(w.data->'members', '[]'::jsonb)) m where lower(m->>'email') = lower(auth.jwt()->>'email')) $$;

-- 4) Thành viên lưu: chỉ nhận khoá thuộc tính năng được Sửa, trong phạm vi được giao; còn lại giữ nguyên của chủ
create or replace function public.qws_member_merge(n jsonb, old jsonb, p jsonb, k text, ids jsonb, fld text) returns jsonb language sql immutable as $$
  select case when not (p ? k) then n
    when ids is null or fld is null then n || jsonb_build_object(k, p->k)
    else n || jsonb_build_object(k, public.qws_scope_arr(old->k, ids, fld, false) || public.qws_scope_arr(p->k, ids, fld, true)) end $$;

create or replace function public.qws_member_save(p_owner uuid, p_data jsonb, p_expect timestamptz) returns table(ok boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare e text := lower(coalesce(auth.jwt()->>'email', '')); w record; m jsonb; a jsonb; ids jsonb; n jsonb; v timestamptz; k text;
begin
  select x.data as d, x.updated_at as at into w from public.qws_workspaces x where x.user_id = p_owner for update;
  if not found then raise exception 'Không có dữ liệu chung'; end if;
  select mm into m from jsonb_array_elements(coalesce(w.d->'members', '[]'::jsonb)) mm where e <> '' and lower(mm->>'email') = e limit 1;
  if m is null then raise exception 'Không phải thành viên'; end if;
  if w.at is distinct from p_expect then return query select false, w.at; return; end if;
  a := public.qws_member_acc(m); ids := a->'_scope'; n := w.d;
  if a->>'customers' = 'edit' then
    n := public.qws_member_merge(n, w.d, p_data, 'customerList', ids, 'id');
    n := public.qws_member_merge(n, w.d, p_data, 'projects', ids, 'customerId');
  end if;
  if a->>'resources' = 'edit' then n := public.qws_member_merge(n, w.d, p_data, 'resources', ids, 'customerId'); end if;
  if a->>'ketoan' = 'edit' then foreach k in array array['expenses','funds','fundTx','fundSchedules','spendCats','transactions'] loop n := public.qws_member_merge(n, w.d, p_data, k, null, null); end loop; end if;
  if a->>'tasks' = 'edit' then foreach k in array array['tasks','family'] loop n := public.qws_member_merge(n, w.d, p_data, k, null, null); end loop; end if;
  if a->>'coinInvest' = 'edit' then n := public.qws_member_merge(n, w.d, p_data, 'coins', null, null); end if;
  if a->>'ads' = 'edit' then n := public.qws_member_merge(n, w.d, p_data, 'adsResults', null, null); end if;
  if n = w.d then return query select true, w.at; return; end if; -- không có gì được phép đổi → không ghi
  update public.qws_workspaces x set data = n where x.user_id = p_owner returning x.updated_at into v;
  return query select true, v;
end $$;

revoke all on function public.qws_member_load() from public, anon;
revoke all on function public.qws_member_head(uuid) from public, anon;
revoke all on function public.qws_member_save(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.qws_member_load() to authenticated;
grant execute on function public.qws_member_head(uuid) to authenticated;
grant execute on function public.qws_member_save(uuid, jsonb, timestamptz) to authenticated;

-- 5) Bỏ quyền đọc / ghi THẲNG khối dữ liệu của tài khoản phụ (chủ giữ nguyên quyền của mình)
drop policy if exists "members read workspace" on public.qws_workspaces;
drop policy if exists "members update workspace" on public.qws_workspaces;

-- Kiểm tra: còn policy nào trên qws_workspaces
select polname, polcmd from pg_policy where polrelid = 'public.qws_workspaces'::regclass;
