-- Gắn TK quảng cáo (Meta + Google) với 1 Dự án/khách của QWS (21/10/2026).
-- Phân quyền theo dự án dùng gắn này cho CHÍNH XÁC; TK chưa gắn vẫn đoán theo tên/thương hiệu như cũ. Chỉ thêm cột, không xoá dữ liệu.
alter table public.qws_ads_accounts add column if not exists qws_customer_id text;
alter table public.qws_gads_accounts add column if not exists qws_customer_id text;
