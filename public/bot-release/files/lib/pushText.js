// Nội dung thông báo đẩy về điện thoại cho các mốc của lệnh (12/11/2026, sếp: "đọc rất khó hiểu").
// Nguyên tắc: tiêu đề nói VIỆC GÌ + COIN + SỐ TIỀN; thân mỗi dòng 1 ý, lời thường (MUA/BÁN, cắt lỗ, chốt lời),
// không dùng LONG/SHORT, SL/TP, R, KL, "phương án D".
const vn = (v, d) => Number(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const px = (v) => Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 8 });
const money = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${vn(Math.abs(v), 2)}$`;
// "giá tăng 0,9%" / "giá giảm 0,9%" — tránh dấu +/− bị hiểu nhầm là lời/lỗ (lệnh BÁN: giá tăng = lỗ)
const move = (from, to) => { const p = ((to - from) / from) * 100; return Math.abs(p) < 0.05 ? "giá gần như không đổi" : `giá ${p > 0 ? "tăng" : "giảm"} ${vn(Math.abs(p), 1)}%`; };
export const sideVn = (s) => (s === 1 ? "MUA" : "BÁN");
export const modeVn = (m) => (m === "live" ? "💵 Tiền thật" : "🧪 Testnet (tiền ảo)");
const tfVn = (tf) => ({ "5m": "M5", "15m": "M15", "1h": "H1", "4h": "H4", "1d": "D1" }[tf] || tf || "");

// Vào lệnh (khớp): a = {side, coin, tf, lim (giá vào), sl, tp, riskUsd, sw3, mode}
export function fillText(a, why = "") {
  const title = `✅ Đã vào lệnh ${sideVn(a.side)} ${a.coin}`;
  const lines = [
    `Giá vào: ${px(a.lim)}`,
    `Cắt lỗ: ${px(a.sl)} (${move(a.lim, a.sl)}) → lỗ tối đa ${vn(a.riskUsd, 2)}$`,
    a.sw3 ? `Chốt lời 1/3 ở: ${px(a.tp)} (${move(a.lim, a.tp)}), phần còn lại để chạy tiếp` : `Chốt lời: ${px(a.tp)} (${move(a.lim, a.tp)})`,
  ];
  if (why && !/^khớp lệnh chờ$/i.test(why)) lines.push(`Cách vào: ${why}`);
  lines.push(`${modeVn(a.mode)} · khung ${tfVn(a.tf)}`);
  return { title, body: lines.join("\n") };
}

// Đặt lệnh chờ: p = {side, coin, tf, lim, sl, tp, riskUsd, sw3, fallbackAt?, until?, mode}; stamp = hàm in giờ
export function pendingText(p, stamp) {
  const title = `📌 Đặt lệnh chờ ${sideVn(p.side)} ${p.coin} ở ${px(p.lim)}`;
  const lines = [
    `Giá chạm ${px(p.lim)} thì vào lệnh`,
    p.sl != null ? `Khi vào: cắt lỗ ${px(p.sl)} · ${p.sw3 ? "chốt 1/3 ở" : "chốt lời"} ${px(p.tp)}` : null,
    `Lỗ tối đa nếu sai: ${vn(p.riskUsd, 2)}$`,
    p.fallbackAt ? `Không chạm giá thì ${stamp(p.fallbackAt)} vào theo giá thị trường` : p.until ? `Không chạm giá thì tự huỷ lúc ${stamp(p.until)}` : null,
    `${modeVn(p.mode)} · khung ${tfVn(p.tf)}`,
  ];
  return { title, body: lines.filter(Boolean).join("\n") };
}

// Chốt lời 1/3: a = {side, coin, lim, tp, partR, partFrac, riskUsd, mode}
export function partialText(a) {
  const gain = (a.partR || 0) * (a.riskUsd || 0) * (a.partFrac ?? 1 / 3);
  const title = `💰 Chốt lời 1/3 lệnh ${sideVn(a.side)} ${a.coin}: ~${money(gain)}`;
  const lines = [
    `Đã ${a.side === 1 ? "bán" : "mua lại"} 1/3 ở ${px(a.tp)} (${move(a.lim, a.tp)} so với giá vào)`,
    `Cắt lỗ dời về giá vào ${px(a.lim)} → phần còn lại không còn lỗ`,
    `Phần còn lại tiếp tục chạy, bot tự dời cắt lỗ theo giá`,
    modeVn(a.mode),
  ];
  return { title, body: lines.join("\n") };
}

const REASON = [
  [/^TP$/, "chạm giá chốt lời"],
  [/^SL$|^Cắt lỗ$/, "chạm giá cắt lỗ"],
  [/Chốt 1\/3 \+ hoà vốn/, "đã chốt 1/3 trước, phần còn lại về hoà vốn"],
  [/Chốt 1\/3 \+ dời SL khoá lời/, "đã chốt 1/3, phần còn lại chạm mức cắt lỗ đã dời lên (khoá lời)"],
  [/Chốt 1\/3 \+ chạm SL dời/, "đã chốt 1/3, phần còn lại chạm mức cắt lỗ đã dời"],
  [/Chạm SL dời/, "chạm mức cắt lỗ đã dời"],
  [/Dời SL theo đáy\/đỉnh/, "chạm mức cắt lỗ đã dời theo giá (lỗ ít hơn dự kiến)"],
  [/^Khác$/, "đóng ở giá khác (đóng tay hoặc hết thời gian giữ lệnh)"],
];
export const reasonVn = (r) => { if (!r) return ""; for (const [re, t] of REASON) if (re.test(r)) return t; return r; };

// Đóng lệnh: a = {side, coin, lim, mode}, net = lãi/lỗ $ đã trừ phí, R = net/rủi ro, exit = giá ra, reason = lý do (mã nội bộ)
export function closeText(a, { net, R, exit, reason }) {
  const even = R != null ? Math.abs(R) < 0.1 : Math.abs(net) < 0.05;
  const head = even ? "➖ Đóng hoà vốn" : net > 0 ? (/SL|Cắt lỗ|dời/i.test(reason || "") ? "🎯 Đóng lệnh có lời" : "🎯 Chốt lời") : "🛑 Cắt lỗ";
  const title = `${head} ${a.coin}: ${money(net)}`;
  const lines = [
    `Lệnh ${sideVn(a.side)} vào ${px(a.lim)}${exit ? ` → ra ${px(exit)} (${move(a.lim, exit)})` : ""}`,
    reason ? `Lý do: ${reasonVn(reason)}` : null,
    even ? `Kết quả: ${money(net)} đã trừ phí (hoà vốn)` : R != null ? `Kết quả: ${money(net)} đã trừ phí = ${R > 0 ? "lời" : "lỗ"} ${vn(Math.abs(R), 1)} lần mức rủi ro` : `Kết quả: ${money(net)} đã trừ phí`,
    modeVn(a.mode),
  ];
  return { title, body: lines.filter(Boolean).join("\n") };
}
