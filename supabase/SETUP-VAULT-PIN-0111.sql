-- 01/11/2026 — Kho Tài khoản & Thẻ BẮT BUỘC PIN (sếp duyệt). Chạy 1 lần trong SQL Editor.
-- Khi chủ đặt PIN, app gọi hàm này để xoá BẢN RÕ của kho (khoá "vault") khỏi các bản sao lưu tự động cũ trong qws_backups
-- (bảng này không cho người dùng sửa trực tiếp). Bản sao lưu sau khi đặt PIN chỉ chứa "vaultEnc" (đã mã hoá).
create or replace function public.qws_backups_scrub_vault() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.qws_backups set private = private - 'vault'
   where user_id = auth.uid() and private ? 'vault';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.qws_backups_scrub_vault() from anon, public;
grant execute on function public.qws_backups_scrub_vault() to authenticated;
