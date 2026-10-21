# Bot giao dịch Futures – Quang Workspace

> **Cách dùng mới (dễ nhất):** máy bàn chỉ cần cài 1 lần bằng `cai-dat-windows.bat`, chỉ dán **SUPABASE_SERVICE_KEY** vào `.env`. Mọi thứ còn lại làm **trong app → Coin → Bot thật → Cài đặt bot**:
> - Chọn Testnet hoặc Tiền thật.
> - Dán khoá API Binance. Khoá được mã hoá ngay trên điện thoại, chỉ máy bot giải mã được.
> - Chỉnh % rủi ro, vốn tối đa, số lệnh, dừng ngày, đòn bẩy.
>
> - **Tự cập nhật (không cần token):** máy chạy bot tự tải bản mới từ web của app (`boss.2bkin.io.vn/bot-release`) 5 phút/lần, hoặc ngay khi bấm "Cập nhật ngay". Bản mới lỗi thì tự quay về bản cũ. Không cần tải ZIP lại nữa.
>   - Token GitHub **chỉ đọc** (mục Tự cập nhật bot) giờ là tuỳ chọn: chỉ dùng dự phòng khi web lỗi.
>
> Bot áp dụng trong khoảng 15 giây. Đổi Testnet ↔ Tiền thật thì bot tự khởi động lại sạch. Các mục dưới đây là cách cấu hình bằng file, chỉ cần khi không dùng app.

Bot chạy nền 24/7 trên máy chạy bot (máy bàn Windows; VPS cũng được). Nó dùng **đúng bộ luật của tab Demo tự động** (`lib/paperBot.js` chép từ app) để tìm tín hiệu trên giá thật, rồi đặt lệnh lên **Binance Futures Testnet** (tiền ảo). Khi nào bạn quyết định thì mới chuyển sang tiền thật.

## Bot làm gì
- Cứ 15 giây bot kiểm tra một lần, và quét tín hiệu mới mỗi khi một nến M5 đóng.
- **Vào lệnh:** đặt lệnh chờ (limit) ở giá đóng của nến tín hiệu. Sau 3 nến mà giá không về điểm vào thì bot **huỷ**.
- **Khi lệnh khớp:** bot đặt ngay **SL** (Stop-Market) và **TP** (Take-Profit-Market), cả hai đều đóng toàn bộ vị thế.
- **Giới hạn rủi ro:**
  - Rủi ro **2% mỗi lệnh**.
  - Tối đa **3 vị thế** cùng lúc, mỗi cặp chỉ 1 vị thế.
  - Đòn bẩy tối đa 20x, ký quỹ riêng (isolated).
  - **Dừng trong ngày khi lỗ 6%**.
  - Giữ lệnh quá 96 nến thì đóng.
- **Dừng khẩn:** bấm "Dừng bot" trong app, hoặc tạo file `data/STOP`. Bot huỷ các lệnh chờ và không mở lệnh mới. Vị thế đang mở vẫn giữ SL/TP.
- **Lệnh thử (chỉ Testnet):** bấm "Lệnh thử" trong app để kiểm tra trọn quy trình khi không ngồi ở máy.
  - Bot đặt 1 lệnh LONG BTC (hoặc ETH) sát giá, rủi ro 0,1% vốn, khớp ngay rồi đặt SL/TP.
  - Giữ 1 phút, đóng theo giá thị trường, ghi lịch sử và gửi thông báo về điện thoại.
  - App hiện từng bước. Thống kê lệnh thật không tính lệnh thử.
- **Đóng tất cả:** bấm "Đóng tất cả" trong app.
  - Bot huỷ mọi lệnh (lệnh chờ, SL/TP) và đóng vị thế theo giá thị trường.
  - Chỉ đụng các cặp của bot (danh sách cặp chọn trong app: Demo → Thêm/sửa cặp, mặc định BTC/ETH/XAU) trong ví Futures, **không đụng ví Spot**.
  - Bot đứng ở trạng thái DỪNG cho tới khi bấm "Chạy lại".
  - Cặp nào đóng không được thì bot giữ SL/TP, thử lại 5 lần rồi báo lỗi.
- **Nhật ký và lịch sử:** từng lệnh ghi vào `data/trades.jsonl`. Trạng thái đẩy về app qua bảng Supabase `qws_live_bot` (dòng `status`). Lịch sử lệnh đã đóng nằm ở dòng `history`, giữ 1.000 lệnh gần nhất, có lãi/lỗ sau phí, R và lý do đóng.
- **Thông báo về điện thoại** (qua hàm `qws-send-push` của app), gửi khi:
  - lệnh khớp hoặc đóng;
  - đặt lệnh lỗi;
  - chạm dừng ngày;
  - đóng tất cả xong;
  - bot chạy lại sau hơn 10 phút im lặng;
  - cài xong bản cập nhật.
  
  Muốn tắt thì đặt `notify: false` trong cài đặt bot của app.

## Cài lần đầu (Testnet)
1. **Tạo khoá Testnet:**
   - Vào https://testnet.binancefuture.com, đăng nhập rồi mở phần **API Key** để tạo khoá.
   - Testnet có sẵn USDT ảo.
   - Chuyển **Chế độ vị thế** sang **Một chiều (One-way)**.
2. **Cài Node.js 22 trở lên:** https://nodejs.org (bản LTS).
3. Trong thư mục bot, chép `.env.example` thành `.env` rồi điền:
   - `MODE=testnet`
   - `BINANCE_KEY` và `BINANCE_SECRET` (khoá testnet).
   - `SUPABASE_SERVICE_KEY`: lấy ở Supabase → Project Settings → API → service_role. Điền vào đây để bot báo về app.
4. Chạy file `supabase.sql` một lần trong Supabase → SQL Editor để tạo bảng báo cáo.
5. **Kiểm tra (không đặt lệnh):** `npm run check`. Mọi dòng phải ra ✅.
6. **Thử trọn quy trình bằng một lệnh giả** sát giá hiện tại: đặt lệnh, khớp, SL/TP rồi đóng.
   - Lệnh: `FAKE_SIGNAL=BTC npm start`. Trên Windows dùng `set FAKE_SIGNAL=BTC && npm start`.
   - Chỉ chạy được ở testnet.
7. **Chạy thật trên testnet:** `npm start`.

## Máy bàn Windows bật 24/7 (cài bấm 1 lần, KHÔNG cần quyền Admin)
1. Tải code từ GitHub về: repo `qws-live-bot` → nút **Code → Download ZIP**. Giải nén vào ví dụ `C:\qws-live-bot`.
2. Bấm đúp **`cai-dat-windows.bat`**. File này tự làm 5 việc:
   - Cài Node.js nếu máy chưa có.
   - Mở Notepad để bạn **tự dán khoá Testnet** vào `.env`.
   - Kiểm tra kết nối (không đặt lệnh nào).
   - Đặt bot **tự chạy mỗi khi Windows đăng nhập**.
   - Chạy bot ngay.
3. Bot chạy trong một cửa sổ thu nhỏ trên thanh Taskbar. **Đừng tắt cửa sổ đó.** Nếu bot bị thoát vì lỗi, nó tự chạy lại sau 15 giây.
4. Các file khác:
   - `xem-log.bat`: xem nhật ký trực tiếp.
   - `go-cai-dat.bat`: gỡ bot khỏi máy.
   - Theo dõi và Dừng bot: app → **Coin → Bot thật**.

### Để mất điện có điện lại thì bot tự chạy (làm 1 lần, mất khoảng 5 phút)
1. **Máy tự bật khi có điện:**
   - Vào BIOS (bấm Del hoặc F2 lúc khởi động máy).
   - Tìm mục **Restore on AC Power Loss / AC Power Recovery**, đặt thành **Power On**.
2. **Windows tự đăng nhập**, không chờ gõ mật khẩu:
   - Bấm Win+R, gõ `netplwiz`.
   - Bỏ tick "Users must enter a user name and password", bấm OK rồi nhập mật khẩu Windows một lần.
   - Windows 11 có thể phải tắt thêm "Require Windows Hello sign-in" trong Settings → Accounts → Sign-in options.
3. **Không cho máy ngủ:** Settings → System → Power → **Sleep: Never** (khi cắm điện).
4. **Hạn chế tự khởi động lại:** Settings → Windows Update → Advanced → **Active hours**. Nếu máy có khởi động lại, bot tự chạy lại sau khi Windows đăng nhập.

**Khi mất điện, lệnh đang mở vẫn an toàn**, vì SL/TP nằm trên sàn Binance. Trạng thái bot lưu trong `data/`. Bật máy lại, bot đọc lại trạng thái, dọn lệnh chờ đã quá hạn rồi chạy tiếp. Trong lúc máy tắt, bot chỉ lỡ các tín hiệu mới.

## Phát hành bản mới (bot tự cập nhật)
Làm trên máy có app:
1. Nếu app đổi luật Demo, chạy `npm run sync-rules`.
2. Commit rồi push lên GitHub.
3. Chạy `npm run release`. Lệnh này cần cây git sạch. Nó ghi các file của commit HEAD cùng `manifest.json` (mã kiểm tra từng file) vào `../quang-workspace/public/bot-release`.
4. Build và deploy app Quang Workspace.

Máy chạy bot nhận bản mới trong khoảng 5 phút:
- Chỉ tải file đã đổi. File nào không khớp mã kiểm tra thì bỏ.
- File `.js` phải qua `node --check`, và bot sao lưu bản cũ trước khi thay.
- Bản mới khởi động lỗi 3 lần thì bot tự quay về bản cũ.
- Bot không tự về bản cũ hơn bản đang chạy.

Cách cũ vẫn dùng được khi cần: bấm `go-cai-dat.bat`, tải ZIP mới **chép đè** (giữ `.env` và `data/`), rồi bấm `cai-dat-windows.bat`.

## Chuyển sang tiền thật (chỉ khi đã chạy testnet ổn 2–4 tuần)
1. **Tạo khoá API mới trên Binance thật:**
   - **Chỉ bật Futures.**
   - **TẮT rút tiền.**
   - **Khoá theo IP của máy chạy bot** (mạng gia đình cần IP tĩnh, hoặc cập nhật lại khi IP đổi).
2. Sửa `.env`:
   - `MODE=live`
   - Thêm dòng `I_UNDERSTAND_REAL_MONEY=1`
   - Khuyên đặt `CAPITAL_CAP=200` và `RISK_PCT=1` trong tháng đầu.
3. Chạy `npm run check` rồi khởi động lại bot: đóng cửa sổ bot, sau đó bấm đúp `windows\run-bot.cmd` hoặc khởi động lại máy. Nếu chạy trên VPS bằng pm2 thì dùng `pm2 restart qws-bot`. Cách dễ hơn là chọn Tiền thật trong app, bot tự khởi động lại.

⚠️ Kết quả quá khứ và kết quả testnet không đảm bảo lợi nhuận thật. Đây không phải tư vấn đầu tư.
