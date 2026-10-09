// KẾT QUẢ THEO MỤC TIÊU CHIẾN DỊCH (Meta): mỗi chiến dịch chấm theo đúng mục tiêu nó tối ưu —
// chạy Tiếp cận thì đo độ phủ (chi phí / 1.000 người), chạy Video đo ThruPlay, chạy Tin nhắn đo chi phí/tin nhắn…
// Mục tiêu lấy từ optimization_goal của nhóm QC (chính xác hơn objective của chiến dịch), thiếu thì theo objective.

// bench = mức tham khảo thị trường VN [rẻ, đắt] cho chi phí / 1 kết quả — chỉ dùng khi chưa có mốc so sánh nội bộ.
export const GOALS = {
  msg: { label: "Tin nhắn", unit: "tin nhắn", costLabel: "Chi phí/tin nhắn", per: 1, val: (m) => m.msgs || 0, bench: [20000, 60000] },
  lead: { label: "Khách tiềm năng", unit: "lead", costLabel: "Chi phí/lead", per: 1, val: (m) => (m.leads || 0) || (m.msgs || 0), bench: [30000, 100000] },
  reach: { label: "Tiếp cận", unit: "nghìn người", costLabel: "Chi phí/1.000 người", per: 1000, val: (m) => (m.reach || 0) / 1000, bench: [8000, 25000] },
  video: { label: "Xem video", unit: "ThruPlay", costLabel: "Chi phí/ThruPlay", per: 1, val: (m) => (m.thruplay || 0) || (m.video3s || 0), bench: [100, 400] },
  engage: { label: "Tương tác", unit: "tương tác", costLabel: "Chi phí/tương tác", per: 1, val: (m) => m.engagement || 0, bench: [100, 500] },
  like: { label: "Thích trang", unit: "lượt thích", costLabel: "Chi phí/lượt thích", per: 1, val: (m) => m.pageLikes || 0, bench: [1000, 4000] },
  traffic: { label: "Click link", unit: "click", costLabel: "Chi phí/click", per: 1, val: (m) => m.linkClicks || 0, bench: [1000, 4000] },
  sales: { label: "Chuyển đổi", unit: "đơn", costLabel: "Chi phí/đơn", per: 1, val: (m) => (m.purchases || 0) || (m.leads || 0), bench: null },
};

const BY_OPT = {
  CONVERSATIONS: "msg", MESSAGING_PURCHASE_CONVERSION: "msg", MESSAGING_APPOINTMENT_CONVERSION: "msg", REPLIES: "msg",
  LEAD_GENERATION: "lead", QUALITY_LEAD: "lead",
  REACH: "reach", IMPRESSIONS: "reach", AD_RECALL_LIFT: "reach",
  THRUPLAY: "video", VIDEO_VIEWS: "video", TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "video",
  POST_ENGAGEMENT: "engage", EVENT_RESPONSES: "engage",
  PAGE_LIKES: "like",
  LINK_CLICKS: "traffic", LANDING_PAGE_VIEWS: "traffic", PROFILE_VISIT: "traffic",
  OFFSITE_CONVERSIONS: "sales", VALUE: "sales", CONVERSIONS: "sales",
};
const BY_OBJ = {
  OUTCOME_AWARENESS: "reach", REACH: "reach", BRAND_AWARENESS: "reach",
  OUTCOME_TRAFFIC: "traffic", LINK_CLICKS: "traffic",
  OUTCOME_LEADS: "lead", LEAD_GENERATION: "lead",
  OUTCOME_SALES: "sales", CONVERSIONS: "sales",
  MESSAGES: "msg", VIDEO_VIEWS: "video", POST_ENGAGEMENT: "engage", PAGE_LIKES: "like",
  OUTCOME_ENGAGEMENT: "engage",
};

// optimization goals của các nhóm QC (mảng) + objective → khoá mục tiêu
export function goalOf(objective, optGoals = []) {
  const counts = {};
  for (const g of optGoals) { const k = BY_OPT[g]; if (k) counts[k] = (counts[k] || 0) + 1; }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : BY_OBJ[objective] || "msg";
}

// Gắn kết quả theo mục tiêu vào 1 dòng số liệu (chiến dịch / QC): goal, goalResults, goalCost (+ costMsg luôn có)
export function withGoal(row, goal) {
  const G = GOALS[goal] || GOALS.msg;
  const res = G.val(row);
  return {
    ...row, goal, goalLabel: G.label, goalUnit: G.unit, goalCostLabel: G.costLabel,
    goalResults: res, goalCost: res > 0 ? row.spend / res : null,
    costMsg: row.msgs > 0 ? row.spend / row.msgs : null,
  };
}

// Mốc so sánh cho từng mục tiêu: chi phí/KQ bình quân (cộng dồn) của MỌI chiến dịch cùng mục tiêu trong kỳ (≥2 chiến dịch có KQ),
// thiếu thì lấy giữa khoảng tham khảo thị trường.
export function goalBaselines(rows) {
  const g = {};
  for (const r of rows) {
    if (!r.goal || !(r.spend > 0)) continue;
    const o = (g[r.goal] = g[r.goal] || { spend: 0, res: 0, n: 0 });
    if (r.goalResults > 0) { o.spend += r.spend; o.res += r.goalResults; o.n++; }
  }
  const out = {};
  for (const [k, G] of Object.entries(GOALS)) {
    const o = g[k];
    if (o && o.n >= 2 && o.res > 0) out[k] = { value: o.spend / o.res, source: "avg", label: `TB các chiến dịch ${G.label.toLowerCase()} kỳ này` };
    else if (G.bench) out[k] = { value: (G.bench[0] + G.bench[1]) / 2, source: "bench", label: "mức tham khảo thị trường VN" };
  }
  return out;
}

// Chấm 1 dòng theo mục tiêu của nó
export function judgeGoal(row, base) {
  const spend = row.spend || 0, res = row.goalResults || 0;
  if (spend <= 0) return { key: "off", label: "Không chạy", tone: "slate" };
  if (!base) return { key: "thin", label: "Ít dữ liệu", tone: "slate" };
  if (res <= 0) return spend >= 1.5 * base.value ? { key: "burn", label: "Đốt tiền", tone: "rose", reason: `tiêu ${Math.round(spend).toLocaleString("vi-VN")}đ mà 0 ${GOALS[row.goal]?.unit || "kết quả"}` } : { key: "thin", label: "Ít dữ liệu", tone: "slate" };
  const ratio = row.goalCost / base.value;
  const key = ratio <= 0.8 ? "great" : ratio <= 1.1 ? "good" : ratio <= 1.5 ? "warn" : "bad";
  const label = { great: "Rất tốt", good: "Đạt", warn: "Hơi đắt", bad: "Đắt" }[key];
  const tone = { great: "emerald", good: "emerald", warn: "amber", bad: "rose" }[key];
  return { key, label, tone, ratio, reason: `${GOALS[row.goal]?.costLabel}: ${Math.round(row.goalCost).toLocaleString("vi-VN")}đ = ${Math.round(ratio * 100)}% ${base.label} (${Math.round(base.value).toLocaleString("vi-VN")}đ)` };
}
