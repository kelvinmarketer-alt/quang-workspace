// Kiểm tra nhanh: khoá API đúng chưa, chế độ vị thế, số dư, kết nối Supabase. KHÔNG đặt lệnh.
import { makeClient } from "./lib/binance.js";
const MODE = (process.env.MODE || "testnet").trim();
const ex = makeClient({ mode: MODE, key: process.env.BINANCE_KEY, secret: process.env.BINANCE_SECRET });
const ok = (m) => console.log("✅", m), bad = (m) => console.log("❌", m);
if (!process.env.BINANCE_KEY) console.log("ℹ️  Không có khoá Binance trong .env → nhập khoá trong app (Coin → Bot thật → Cài đặt). Bỏ qua kiểm tra Binance.");
else try {
  await ex.syncTime(); ok(`Kết nối ${ex.base} (${MODE === "live" ? "TIỀN THẬT" : "testnet – tiền ảo"})`);
  const b = await ex.balance(); const u = b.find((x) => x.asset === "USDT");
  ok(`Khoá API hợp lệ · số dư USDT: ${Number(u?.balance || 0).toFixed(2)}`);
  const d = await ex.positionMode(); d.dualSidePosition ? bad("Đang ở chế độ Hedge — đổi sang MỘT CHIỀU (One-way) trong Cài đặt Futures") : ok("Chế độ vị thế: Một chiều (One-way)");
  for (const s of ["BTCUSDT", "ETHUSDT", "XAUUSDT"]) { const i = await ex.symbolInfo(s); ok(`${s}: ${i.status} · bước giá ${i.tick} · tối thiểu ${i.minNotional} USDT`); }
} catch (e) { bad(e.message); if (/API-key|signature|-2014|-2015|-1022/.test(e.message)) console.log("   → Kiểm tra lại BINANCE_KEY / BINANCE_SECRET trong .env (đúng loại testnet/live, đủ quyền Futures, IP được phép)"); }
if (process.env.SUPABASE_SERVICE_KEY) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/qws_live_bot?select=id&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } });
  r.ok ? ok("Supabase: bot báo về app được") : bad(`Supabase ${r.status} — đã chạy supabase.sql chưa?`);
} else console.log("ℹ️  Chưa điền SUPABASE_SERVICE_KEY → bot chỉ ghi log trong máy, app chưa thấy trạng thái bot");
