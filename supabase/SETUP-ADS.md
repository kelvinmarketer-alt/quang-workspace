# Bật module Quảng cáo (Meta Ads) cho Quang Workspace

Frontend (`/quang-cao`, `src/pages/Ads.jsx`) đã có sẵn. Cần làm 3 bước trên **Supabase dashboard**
(project `dbfffwtnxhytcoczhxhf`) vì MCP chỉ đọc.

## 1. Deploy function `qws-meta-ads`

Edge Functions → **Deploy a new function** → tên `qws-meta-ads` → dán code `supabase/functions/qws-meta-ads/index.ts` → Deploy.
Sau khi deploy: vào function → **Details / Settings** → **TẮT "Verify JWT"** (function tự kiểm tra đăng nhập chủ + cron key).

## 2. Đặt secrets — Edge Functions → Secrets → Add new secret

| Tên | Giá trị |
|---|---|
| `META_TOKEN_NSTT` | token System User BM Nông sản Tuấn Tú (TKQC 2 + 3) |
| `META_TOKEN_TMV` | token report-bot BM TMV Philippine (Hebrow + Lina) |
| `META_TOKEN_MICAY` | token report-bot BM Mì Cay Busansan |
| `META_TOKEN_PHITRUONG` | token report-bot BM Phi Trường |
| `CRON_KEY` | lấy ở bước 3 (câu SELECT cuối) |
| `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` | *(tuỳ chọn)* muốn nhận cảnh báo qua Telegram |

`OWNER_EMAIL` đã có từ module Coin. Cảnh báo luôn đẩy **Web Push** về app; Telegram chỉ gửi khi có 2 secret trên.

## 3. Bảng chống trùng cảnh báo + lịch chạy — SQL Editor → Run

```sql
-- Bảng nhớ cảnh báo đã gửi (mỗi loại 1 lần/ngày). Không policy = chỉ service role đọc/ghi.
create table if not exists public.qws_ads_alerts (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.qws_ads_alerts enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Khoá bí mật cho cron (tự sinh ngẫu nhiên, cất trong Vault)
select vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'qws_ads_cron_key')
where not exists (select 1 from vault.secrets where name = 'qws_ads_cron_key');

-- Soát số HÔM NAY 15 phút/lần, 7h00–22h45 giờ VN (00–15 UTC)
select cron.schedule('qws-ads-watch', '*/15 0-15 * * *', $$
  select net.http_post(
    url := 'https://dbfffwtnxhytcoczhxhf.supabase.co/functions/v1/qws-meta-ads',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'qws_ads_cron_key')),
    body := '{"mode":"watch"}'::jsonb,
    timeout_milliseconds := 60000);
$$);

-- Tóm tắt HÔM QUA lúc 6h00 sáng VN (23 UTC)
select cron.schedule('qws-ads-daily', '0 23 * * *', $$
  select net.http_post(
    url := 'https://dbfffwtnxhytcoczhxhf.supabase.co/functions/v1/qws-meta-ads',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'qws_ads_cron_key')),
    body := '{"mode":"daily"}'::jsonb,
    timeout_milliseconds := 60000);
$$);

-- Lấy giá trị để dán vào secret CRON_KEY (bước 2)
select decrypted_secret from vault.decrypted_secrets where name = 'qws_ads_cron_key';
```

## Cảnh báo tự động

- **Chuyển đổi**: tiêu ≥100k trong ngày mà 0 tin/lead · giá/kết quả hôm nay cao hơn 30% so với TB 7 ngày.
- **Thương hiệu**: CPM hôm nay cao hơn 30% so với TB 7 ngày · tần suất 7 ngày > 3 (trong bản tóm tắt 6h sáng).
- **Mọi tài khoản**: tài khoản bị khoá · quảng cáo bị từ chối · đã tiêu >90% giới hạn chi tiêu.

## Thêm / bớt tài khoản

Sửa mảng `ACCOUNTS` đầu file function (id TKQC, tên, nhóm `brand`/`conv`, tên secret token) rồi deploy lại.
