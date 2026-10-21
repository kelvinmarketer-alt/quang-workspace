-- Quang Workspace — LỊCH SAO LƯU TỰ ĐỘNG mỗi ngày 3h sáng giờ VN, giữ 30 ngày. Chạy SAU file SETUP-SECURITY.sql.
-- Tách riêng: nếu project chưa bật pg_cron thì lỗi chỉ ở file này, phần bảo mật + bảng sao lưu vẫn đã tạo xong.
-- Lỗi "extension pg_cron is not available / permission denied" → Dashboard → Database → Extensions → bật "pg_cron" rồi chạy lại file này.
create extension if not exists pg_cron;
select cron.unschedule('qws-daily-backup') where exists (select 1 from cron.job where jobname = 'qws-daily-backup');
-- 3h sáng giờ VN (20:00 UTC)
select cron.schedule('qws-daily-backup', '0 20 * * *', $$
  insert into public.qws_backups(user_id, kind, data, private)
    select w.user_id, 'auto', w.data, p.data from public.qws_workspaces w left join public.qws_private p using (user_id);
  delete from public.qws_backups where created_at < now() - interval '30 days';
$$);
