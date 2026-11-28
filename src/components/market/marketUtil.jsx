// Tách từ pages/CoinMarket.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { fmtNum, fmtPct } from "../../lib/format.js";

export const DEFAULT_WATCH = ["BTC", "ETH", "XAU", "BNB", "SOL", "XRP", "ADA", "LTC", "DOGE"];
export const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
export const pct = (x, base) => (x && base ? ((x - base) / base) * 100 : null);
export const sPct = (v) => (v == null || !isFinite(v) ? "" : `${v >= 0 ? "+" : ""}${fmtPct(v, 2)}`); // "+1,25%"
export const sR = (v, d = 2) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, d, 1)}R`); // "+2,1R"
export const pad = (n) => String(n).padStart(2, "0");
export const dt = (t) => { const d = new Date(t); return isNaN(d) ? "—" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const otherMkt = (m) => (m === "futures" ? "spot" : "futures");
// Mã có trên Futures/Spot không — học dần khi tải nến / kiểm tra mã ("futures|XAU" → true/false)
export const AVAIL = new Map();
// Giá gõ tay: "108123.4" · "108.123,4" · "0,25" → số
export const parseNum = (s) => { let x = String(s ?? "").replace(/\s/g, ""); if (x.includes(",") && x.includes(".")) x = x.replace(/\./g, "").replace(",", "."); else x = x.replace(",", "."); const n = Number(x); return isFinite(n) ? n : NaN; };

// Lệnh bot demo (settings.paperBot) để vẽ lên biểu đồ: chạy lại phiên bằng worker (như tab Demo), giữ kết quả 5 phút ở bộ nhớ module
