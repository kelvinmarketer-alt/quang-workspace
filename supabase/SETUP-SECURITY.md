# Bật bảo mật + chống ghi đè + sao lưu + AI qua máy chủ (làm 1 lần, ~3 phút)

Project Supabase `dbfffwtnxhytcoczhxhf` (tên hiển thị "vty-logistics" — **Quang Workspace cũng nằm ở đây, KHÔNG xoá project này**).
Code app đã sẵn sàng: chưa làm bước dưới thì app vẫn chạy kiểu cũ; làm xong thì app tự chuyển sang chế độ mới ở lần mở kế tiếp.

## Bước 1 — Chạy SQL
1. Mở https://supabase.com/dashboard/project/dbfffwtnxhytcoczhxhf/sql/new
2. Dán TOÀN BỘ nội dung file `supabase/SETUP-SECURITY.sql` → bấm **Run**.
   (Nếu hiện hộp cảnh báo "destructive operation" do có `drop policy if exists` → bấm xác nhận chạy; lệnh chỉ thay chính sách cũ cùng tên, không xoá dữ liệu.)
3. Kết quả mong đợi: "Success". Đã tạo: `qws_private`, `qws_backups` (+ 1 bản sao lưu đầu tiên), `qws_ai_usage`, hàm `qws_save`, trigger `qws_guard`, lịch cron `qws-daily-backup` (3h sáng VN).

## Bước 2 — Bật hàm AI `qws-ai`
1. Mở https://supabase.com/dashboard/project/dbfffwtnxhytcoczhxhf/functions → **Deploy a new function** → **Via Editor**.
2. Tên function: `qws-ai`. Xoá code mẫu, dán toàn bộ `supabase/functions/qws-ai/index.ts` → **Deploy function**.
3. Giữ nguyên "Verify JWT" (BẬT). Không cần thêm secret nào — key OpenAI lấy từ kho riêng của chủ.

## Bước 3 — Mở lại app
Tải lại boss.2bkin.io.vn (tài khoản chủ). App tự:
- chuyển Tài khoản & Thẻ + OpenAI key sang kho riêng, gỡ khỏi khối dữ liệu chung;
- hiện thanh **Đặt PIN** trong trang Tài khoản & Thẻ;
- Cài đặt → **Sao lưu tự động** có danh sách bản sao lưu; **Chi phí AI tháng này** bắt đầu đếm từ lần dùng AI kế tiếp.
