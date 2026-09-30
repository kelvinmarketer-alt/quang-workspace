# Bật nhiều người dùng + phân quyền (chung dữ liệu)

Chủ workspace (Quang) thêm/sửa thành viên ngay trong app: **Cài đặt → Người dùng & phân quyền** (lưu trong `data.members`). Để thành viên **đăng nhập thấy dữ liệu chung**, chạy 2 policy RLS này **1 lần** trên Supabase → SQL Editor:
`https://supabase.com/dashboard/project/dbfffwtnxhytcoczhxhf/sql/new`

```sql
-- THÀNH VIÊN (email có trong data->members của chủ) được ĐỌC workspace của chủ
create policy "members read workspace" on public.qws_workspaces
  for select to authenticated
  using ( lower(auth.jwt()->>'email') in (
    select lower(m->>'email') from jsonb_array_elements(coalesce(data->'members','[]'::jsonb)) m
  ) );

-- ... và được SỬA (cùng làm việc trên 1 dữ liệu)
create policy "members update workspace" on public.qws_workspaces
  for update to authenticated
  using ( lower(auth.jwt()->>'email') in (
    select lower(m->>'email') from jsonb_array_elements(coalesce(data->'members','[]'::jsonb)) m
  ) )
  with check ( true );
```

(2 policy này CỘNG THÊM vào policy chủ-sở-hữu sẵn có — không xoá gì, không ảnh hưởng dữ liệu của bạn.)

## Thành viên vào app thế nào
1. Chủ vào **Cài đặt → Người dùng & phân quyền** → thêm email thành viên + tick mục được phép.
2. Thành viên mở app (`boss.2bkin.io.vn`) → **Đăng ký** bằng ĐÚNG email đó (tự đặt mật khẩu).
3. Nếu bật xác nhận email mà chưa nhận được mail: chủ xác nhận nhanh bằng SQL
   `update auth.users set email_confirmed_at = now() where email = 'email_thanh_vien';`
4. Thành viên đăng nhập → chỉ thấy các mục được cấp; dữ liệu chung với chủ.

## Gỡ quyền
Chủ xoá thành viên trong app là họ mất quyền truy cập ngay (RLS dựa trên danh sách này).
