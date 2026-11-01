-- 01/11/2026 — sếp chốt: THÀNH VIÊN KHÔNG XEM ĐƯỢC TIỀN COIN (ví Binance, tiền nạp, lãi/lỗ, bot thật). Chạy 1 lần trong SQL Editor.

-- 1) Bot thật: bỏ quyền đọc trạng thái / lịch sử của thành viên (số dư, lãi/lỗ $) — chỉ còn chủ (policy "owner read")
drop policy if exists "member read bot" on public.qws_live_bot;

-- 2) Dữ liệu gửi cho thành viên: không còn danh mục coin (coins) + tiền đã nạp (coinDeposits) dù hồ sơ cũ lỡ cấp "Đầu tư"
do $$
declare src text := pg_get_functiondef('public.qws_member_view(jsonb,jsonb)'::regprocedure);
  old text := 'if a->>''coinInvest'' <> ''none'' then keys := keys || array[''coins'']; skeys := skeys || array[''coinDeposits'']; end if;';
begin
  if position(old in src) > 0 then execute replace(src, old, '-- 01/11: coin (tiền thật) chỉ chủ'); end if;
end $$;

-- Kiểm tra: phải KHÔNG còn dòng "member read bot", và hàm không còn ''coins''
-- select policyname from pg_policies where tablename = 'qws_live_bot';
-- select position('''coins''' in pg_get_functiondef('public.qws_member_view(jsonb,jsonb)'::regprocedure)) = 0 as da_bo_coin;
