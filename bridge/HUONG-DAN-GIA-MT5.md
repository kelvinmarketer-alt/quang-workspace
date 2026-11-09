# Cầu nối giá MT5 → tab "Thị trường Forex" (09/11/2026)

Tab Thị trường → **Forex · MT5** lấy giá + nến từ MT5 trên máy bàn Windows. Trình duyệt không đọc được MT5, nên `mt5_market.py` chạy cạnh MT5 và đẩy dữ liệu lên Supabase (bảng `qws_mt5_bot`, cùng bảng EA, không cần tạo bảng mới).

Chỉ ĐỌC dữ liệu: không gọi `order_send`, không đụng EA `QWS_Gop`, không hỏi mật khẩu.

## Cài (một lần, trên máy bàn Windows)
1. Chép `mt5_market.py` và `cai-cau-noi-gia.bat` vào `C:\mt5-research\bridge\` (cạnh `mt5_bridge.py`).
2. File `.env` của cầu nối EA (có `SUPABASE_URL` và khoá service) đã đủ — `mt5_market.py` tự đọc cùng file đó.
3. MT5 mở sẵn, đã đăng nhập IC Markets.
4. Bấm đúp `cai-cau-noi-gia.bat` → tự chạy mỗi lần đăng nhập Windows. Chạy thử bằng tay để xem log:
   `C:\mt5-research\.venv\Scripts\python.exe C:\mt5-research\bridge\mt5_market.py`
5. Vài giây sau, tab Thị trường → Forex hiện giá + nến; dải trên cùng báo "MT5 đang gửi giá".

## Danh sách mã
- Mặc định: XAUUSD, EURUSD, GBPUSD, USDJPY, BTCUSD, ETHUSD, US500, JP225, US2000 (6 mã của EA + 3 cặp chính).
- Thêm mã: gõ mã vào ô tìm kiếm của tab (vd `AUDUSD`) + Enter → app ghi vào `command.watch`, cầu nối thấy trong ≤ 30 giây, kiểm tra sàn có mã đó không rồi báo lại. Mã có hậu tố của sàn (vd `.r`) tự dò.
- Mã sàn không có → app báo "Sàn MT5 không có mã …".

## Dữ liệu
- Mỗi mã × khung (M5, M15, H1, H4, D1, W1, MN1): 200–1000 nến, ghi lại khi nến mới mở. Nến đang chạy + giá mua/bán cập nhật ~6 giây/lần.
- **Khối lượng = tick volume** (số lần giá nhảy), không phải khối lượng khớp thật. Không có mua/bán chủ động, lệnh lớn, thanh lý, OI → app tắt các lớp đó ở Forex.
- Giờ nến: đổi từ giờ máy chủ IC Markets (GMT+2, mùa hè Mỹ GMT+3) sang UTC. Nếu thấy nến lệch giờ so với MT5, đặt biến `MT5_SERVER_OFFSET_H=2` (hoặc 3) trong `.env`.
- Cuối tuần chợ đóng: app báo "Chợ đang đóng cửa", hiện dữ liệu phiên cuối.

## Sự cố thường gặp
| Hiện tượng | Cách xử lý |
|---|---|
| Tab báo "Cầu nối giá MT5 chưa chạy" | Chạy tay lệnh ở bước 4, xem log báo lỗi gì |
| "MT5 mất liên lạc" | Máy bàn tắt / MT5 đóng / script dừng — mở lại MT5, chạy `schtasks /Run /TN "QWS MT5 Market Bridge"` |
| Log "KHÔNG có mã X" | Tên mã sàn khác — kiểm tra trong Market Watch của MT5 |
| Lỗi 401/403 khi ghi | Khoá service sai — dùng đúng khoá của `mt5_bridge.py` |
