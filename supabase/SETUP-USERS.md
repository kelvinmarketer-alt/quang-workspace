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

> ⚠️ 22/10/2026: 2 policy trên ĐÃ ĐƯỢC THAY bằng `SETUP-MEMBER-SCOPE.sql` (máy chủ lọc dữ liệu theo quyền + phạm vi dự án). KHÔNG chạy lại 2 policy này.

(2 policy này CỘNG THÊM vào policy chủ-sở-hữu sẵn có — không xoá gì, không ảnh hưởng dữ liệu của bạn.)

## Thành viên vào app thế nào
1. Chủ vào **Cài đặt → Người dùng & phân quyền** → thêm email thành viên + tick mục được phép.
2. ⚠️ 01/11/2026: TỰ ĐĂNG KÝ ĐÃ TẮT (Authentication → Sign In / Providers → Allow new users to sign up = OFF) vì người lạ tự tạo tài khoản được.
   Chủ tạo tài khoản: Supabase → Authentication → Users → **Add user** → đúng email đó, tick Auto confirm, đặt mật khẩu → gửi cho thành viên.
3. Thành viên đổi mật khẩu trong app (Cài đặt) sau lần đăng nhập đầu.
4. Thành viên đăng nhập → chỉ thấy các mục được cấp; dữ liệu chung với chủ.

## Gỡ quyền
Chủ xoá thành viên trong app là họ mất quyền truy cập ngay (RLS dựa trên danh sách này).
