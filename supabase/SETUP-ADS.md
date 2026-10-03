# Bật module Quảng cáo (Meta Ads) cho Quang Workspace

Frontend (`/quang-cao`, `src/pages/Ads.jsx`) đã có sẵn. Cần làm 3 bước trên **Supabase dashboard**
(project `dbfffwtnxhytcoczhxhf`) vì MCP chỉ đọc.

## 1. Deploy function `qws-meta-ads`

Edge Functions → **Deploy a new function** → tên `qws-meta-ads` → dán code `supabase/functions/qws-meta-ads/index.ts` → Deploy.
Sau khi deploy: vào function → **Details / Settings** → **TẮT "Verify JWT"** (function tự kiểm tra đăng nhập chủ + cron key).

## 2. (Tuỳ chọn) Secrets — Edge Functions → Secrets

| Tên | Giá trị |
|---|---|
| `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` | *(tuỳ chọn)* muốn nhận cảnh báo qua Telegram |

`OWNER_EMAIL` đã có từ module Coin. Cảnh báo luôn đẩy **Web Push** về app; Telegram chỉ gửi khi có 2 secret trên.

## 3. Bảng tài khoản/token + chống trùng cảnh báo + lịch chạy — SQL Editor → Run

```sql
-- TKQC + token (thêm/sửa trong app: Cài đặt → Quảng cáo). Không policy = chỉ service role (edge fn) đọc được token.
create table if not exists public.qws_ads_accounts (
  id text primary key,                 -- ID tài khoản QC (không có act_)
  name text not null,
  brand text,
  grp text not null default 'conv' check (grp in ('conv', 'brand')),
  services boolean not null default false,
  token text not null,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.qws_ads_accounts enable row level security;

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

-- Function so khớp khoá cron với Vault (chỉ service role gọi được) → không cần secret CRON_KEY
create or replace function public.qws_ads_check_cron_key(k text) returns boolean
language sql security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'qws_ads_cron_key' and decrypted_secret = k);
$$;
revoke all on function public.qws_ads_check_cron_key(text) from public, anon, authenticated;
grant execute on function public.qws_ads_check_cron_key(text) to service_role;
```

## Cảnh báo tự động

- **Chuyển đổi**: tiêu ≥100k trong ngày mà 0 tin/lead · giá/kết quả hôm nay cao hơn 30% so với TB 7 ngày.
- **Thương hiệu**: CPM hôm nay cao hơn 30% so với TB 7 ngày · tần suất 7 ngày > 3 (trong bản tóm tắt 6h sáng).
- **Mọi tài khoản**: tài khoản bị khoá · quảng cáo bị từ chối · đã tiêu >90% giới hạn chi tiêu.

## 3b. Bảng Google Ads — SQL Editor → Run

```sql
-- GOOGLE ADS: số liệu do Google Ads Script đẩy về mỗi giờ. Không policy = chỉ service role (edge fn).
create table if not exists public.qws_ads_kv (
  k text primary key,
  v text not null,
  updated_at timestamptz not null default now()
);
alter table public.qws_ads_kv enable row level security;

create table if not exists public.qws_gads_accounts (
  customer_id text primary key,          -- 10 số, không gạch
  name text not null,                    -- tên hiển thị (sửa trong app)
  name_meta text,                        -- tên trên Google Ads
  currency text default 'VND',
  grp text not null default 'conv' check (grp in ('conv', 'brand')),
  active boolean not null default true,
  policy_issues int not null default 0,
  last_sync timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.qws_gads_accounts enable row level security;

create table if not exists public.qws_gads_daily (
  customer_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  campaign_status text,
  channel text,
  cost numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric not null default 0,
  conv_value numeric not null default 0,
  search_is numeric,
  budget_lost_is numeric,
  updated_at timestamptz not null default now(),
  primary key (customer_id, date, campaign_id)
);
alter table public.qws_gads_daily enable row level security;

create table if not exists public.qws_gads_kw_daily (
  customer_id text not null,
  date date not null,
  ad_group_id text not null,
  criterion_id text not null,
  keyword text,
  match_type text,
  campaign_name text,
  cost numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric not null default 0,
  primary key (customer_id, date, ad_group_id, criterion_id)
);
alter table public.qws_gads_kw_daily enable row level security;

-- Ngày sớm nhất đã có của từng tài khoản (script dùng để quyết định nạp lùi 120 ngày lần đầu)
create or replace function public.qws_gads_earliest() returns table (customer_id text, earliest date)
language sql security definer set search_path = public as $$
  select customer_id, min(date) from public.qws_gads_daily group by customer_id;
$$;
revoke all on function public.qws_gads_earliest() from public, anon, authenticated;
grant execute on function public.qws_gads_earliest() to service_role;
```

## 4. Thêm tài khoản — trong app

**Cài đặt → Quảng cáo — tài khoản & token Meta** → dán token System User của 1 BM → **Lấy danh sách TKQC** →
tick tài khoản, đặt tên + nhóm (Chuyển đổi / Thương hiệu) → **Lưu**. BM mới sau này làm y hệt, không cần deploy lại.

**Google Ads**: Cài đặt → **Lấy script Google Ads** → Copy → dán vào Google Ads **MCC 2BKIN** (Công cụ → Hành động hàng loạt → Tập lệnh)
và trong tài khoản lẻ **VUADONGGOI** → Uỷ quyền → Lưu → Tần suất **Hằng giờ**. Lần chạy đầu tự nạp lùi 120 ngày.
Tài khoản loại trừ sửa ở mảng `EXCLUDE` đầu script (đang loại FPT-HPG).
