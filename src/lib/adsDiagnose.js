// CHẤM ĐIỂM HIỆU QUẢ QUẢNG CÁO — tính bằng CODE (không để AI tự tính số → hết sai chiều tăng/giảm).
// Mốc so sánh (theo thứ tự ưu tiên): KPI bạn đặt (Giá/KQ mục tiêu) → giá/KQ kỳ trước (đủ ≥5 KQ) → giá/KQ TB tài khoản.

export const VERDICT = {
  great: { label: "Rất tốt", tone: "emerald" },
  good: { label: "Đạt", tone: "emerald" },
  warn: { label: "Hơi đắt", tone: "amber" },
  bad: { label: "Đắt", tone: "rose" },
  burn: { label: "Đốt tiền", tone: "rose" },
  thin: { label: "Ít dữ liệu", tone: "slate" },
  off: { label: "Không chạy", tone: "slate" },
  fatigue: { label: "Khách xem lặp", tone: "amber" },
  ok: { label: "Ổn", tone: "emerald" },
};

const pctChange = (cur, prev) => (cur == null || prev == null || !prev ? null : ((cur - prev) / Math.abs(prev)) * 100);
const r0 = (v) => (v == null ? null : Math.round(v));
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function daysOf(since, until) {
  return Math.round((Date.parse(until + "T00:00:00") - Date.parse(since + "T00:00:00")) / 86400000) + 1;
}

// Đánh giá 1 dòng (tài khoản / chiến dịch / QC / từ khoá) theo giá/KQ so với mốc
export function judge(row, target) {
  const spend = row.spend || 0, res = row.results || 0;
  if (spend <= 0) return { key: "off", ...VERDICT.off };
  if (!target) return res > 0 ? { key: "thin", ...VERDICT.thin, reason: "chưa có mốc so sánh" } : { key: "thin", ...VERDICT.thin };
  if (res === 0) {
    return spend >= 1.5 * target
      ? { key: "burn", ...VERDICT.burn, reason: `tiêu ${Math.round(spend / target * 10) / 10}× giá mục tiêu mà 0 kết quả` }
      : { key: "thin", ...VERDICT.thin, reason: "chưa có kết quả, tiêu chưa nhiều" };
  }
  const ratio = row.cpr / target;
  const key = ratio <= 0.8 ? "great" : ratio <= 1.1 ? "good" : ratio <= 1.5 ? "warn" : "bad";
  return { key, ...VERDICT[key], ratio: r1(ratio), lowSample: res < 3, reason: `giá/KQ = ${Math.round(ratio * 100)}% mốc${res < 3 ? " (mới " + res + " KQ)" : ""}` };
}

function brandJudge(a) {
  const t = a.totals || {};
  if (!t.spend) return { key: "off", ...VERDICT.off };
  if (t.frequency > 3) return { key: "fatigue", ...VERDICT.fatigue, reason: `tần suất ${t.frequency.toFixed(1)} — cùng 1 người xem quá nhiều lần` };
  const dCpm = pctChange(t.cpm, a.prev?.cpm);
  if (dCpm != null && dCpm > 40) return { key: "warn", ...VERDICT.warn, reason: `CPM tăng ${Math.round(dCpm)}% so với kỳ trước` };
  return { key: "ok", ...VERDICT.ok };
}

// Mốc giá/KQ cho 1 tài khoản
export function baselineOf(a, kpi) {
  if (kpi?.cpr > 0) return { value: kpi.cpr, source: "kpi", label: "KPI bạn đặt" };
  if (a.prev?.results >= 5 && a.prev.cpr) return { value: a.prev.cpr, source: "prev", label: "giá/KQ kỳ trước" };
  if (a.totals?.results >= 3 && a.totals.cpr) return { value: a.totals.cpr, source: "avg", label: "TB tài khoản kỳ này" };
  return null;
}

function itemsOf(a) {
  const g = a.platform === "google";
  return {
    campaigns: (a.campaigns || []).filter((c) => c.spend > 0),
    services: a.services || null,
    adsets: a.adsets || null,
    ads: (a.ads || []).filter((x) => x.spend > 0),
    keywords: g ? (a.keywords || []).filter((k) => k.spend > 0) : null,
  };
}

const slim = (x, extra = {}) => ({ name: x.name, spend: r0(x.spend), results: r1(x.results), cpr: r0(x.cpr), ctr: r1(x.ctr), ...extra });

export function diagnose(accounts, { targets = {}, adsResults = [], since, until }) {
  const days = daysOf(since, until);
  const out = accounts.filter((a) => !a.error).map((a) => {
    const t = a.totals || {}, p = a.prev;
    const isG = a.platform === "google";
    const kpi = targets[a.id] || {};
    const real = adsResults.filter((r) => r.accountId === a.id && r.date >= since && r.date <= until);
    const customers = real.reduce((s, r) => s + (Number(r.customers) || 0), 0);
    const revenue = real.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const deltas = p ? {
      spend: r0(pctChange(t.spend, p.spend)), results: r0(pctChange(t.results, p.results)), cpr: r0(pctChange(t.cpr, p.cpr)),
      cpm: r0(pctChange(t.cpm, p.cpm)), ctr: r0(pctChange(t.ctr, p.ctr)), reach: r0(pctChange(t.reach, p.reach)),
    } : null;
    const base = { id: a.id, name: a.name, platform: isG ? "google" : "meta", group: a.group, spend: r0(t.spend), deltas };

    if (a.group === "brand") {
      return {
        ...base, verdict: brandJudge(a),
        brand: { reach: r0(t.reach), impressions: r0(t.impressions), frequency: r1(t.frequency), cpm: r0(t.cpm), thruplay: r0(t.thruplay), engagement: r0(t.engagement), pageLikes: r0(t.pageLikes), costPer1kReach: t.reach ? r0((t.spend / t.reach) * 1000) : null },
        notes: [], scale: [], cut: [],
      };
    }

    if (!t.spend) return { ...base, verdict: { key: "off", ...VERDICT.off }, notes: [], scale: [], cut: [] };
    const bl = baselineOf(a, kpi);
    const target = bl?.value || null;
    // Tài khoản: so KPI / kỳ trước. Chỉ có TB chính nó → chưa chấm được (tự so với mình luôn "Đạt")
    const verdict = bl?.source === "avg" ? { key: "thin", ...VERDICT.thin, label: "Chưa có KPI", reason: "đặt KPI giá/kết quả để chấm tài khoản" } : judge(t, target);
    // Từng chiến dịch/QC: có KPI → so KPI; chưa có → so TB tài khoản kỳ này (xếp hạng tốt/kém TRONG tài khoản)
    const itemTarget = kpi.cpr > 0 ? kpi.cpr : t.results >= 3 && t.cpr ? t.cpr : target;
    const it = itemsOf(a);
    const judgeList = (list) => (list || []).map((x) => ({ ...x, _v: judge(x, itemTarget) }));
    const camps = judgeList(it.services || it.campaigns);
    const ads = judgeList(it.ads);
    const kws = judgeList(it.keywords);
    const pool = [...camps, ...(isG ? kws : ads)];
    const scale = pool.filter((x) => ["great", "good"].includes(x._v.key) && (x.results || 0) >= 2).sort((x, y) => x.cpr - y.cpr).slice(0, 5);
    const cut = pool.filter((x) => ["burn", "bad"].includes(x._v.key)).sort((x, y) => y.spend - x.spend).slice(0, 6);
    const wasted = cut.filter((x) => x._v.key === "burn").reduce((s, x) => s + x.spend, 0);

    // Cờ chẩn đoán (luật cố định)
    const notes = [];
    if (days < 3) notes.push(`Kỳ chỉ ${days} ngày — số ít, dễ nhiễu; nên xem 7 ngày trở lên trước khi tắt/bật.`);
    if (!kpi.cpr) notes.push(`Chưa đặt KPI giá/kết quả → đang so với ${bl ? bl.label + " (" + Math.round(target).toLocaleString("vi-VN") + "đ)" : "không có mốc"}.`);
    if (!isG && t.impressions >= 2000 && t.ctr < 0.8) notes.push(`CTR ${t.ctr.toFixed(2)}% thấp (<0,8%) — mẫu quảng cáo chưa đủ hút.`);
    if (!isG && t.frequency > 2.5) notes.push(`Tần suất ${t.frequency.toFixed(1)} — tệp nhỏ/khách xem lặp, giá dễ đội.`);
    if (deltas?.cpm != null && deltas.cpm > 40) notes.push(`CPM tăng ${deltas.cpm}% so với kỳ trước — cạnh tranh hoặc đối tượng quá hẹp.`);
    if (t.replyRate != null && t.msgs >= 5 && t.replyRate < 50) notes.push(`Chỉ ${Math.round(t.replyRate)}% tin nhắn có trả lời tiếp — kiểm tra kịch bản inbox / chất lượng khách.`);
    if (isG && t.budgetLostIS > 20 && ["great", "good"].includes(verdict.key)) notes.push(`Mất ${Math.round(t.budgetLostIS)}% lượt hiển thị do thiếu ngân sách mà CPA đang tốt → nên tăng ngân sách.`);
    if (isG && t.searchIS != null && t.searchIS < 30) notes.push(`Tỉ lệ hiển thị tìm kiếm chỉ ${Math.round(t.searchIS)}% — giá thầu/điểm chất lượng thấp.`);
    const weakAds = ads.filter((x) => /BELOW_AVERAGE/.test(x.quality || "") || /BELOW_AVERAGE/.test(x.convRank || ""));
    if (weakAds.length) notes.push(`${weakAds.length} quảng cáo bị Meta xếp hạng chất lượng/chuyển đổi DƯỚI TRUNG BÌNH.`);
    if (a.issues?.length) notes.push(`${a.issues.length} quảng cáo bị từ chối / có vấn đề chính sách.`);
    if (wasted > 0) notes.push(`${Math.round(wasted).toLocaleString("vi-VN")}đ đã tiêu vào mục 0 kết quả (≥1,5× mốc giá).`);
    if (a.group === "conv" && !customers) notes.push("Chưa nhập khách chốt/doanh thu thật → chưa biết lãi/lỗ thật, chỉ biết giá tin nhắn/lead.");

    const realStats = customers || revenue ? {
      customers, revenue: r0(revenue),
      costPerCustomer: customers ? r0(t.spend / customers) : null,
      closeRate: customers && t.results ? r1((customers / t.results) * 100) : null,
      roas: revenue && t.spend ? r1(revenue / t.spend) : null,
      cpaTarget: kpi.cpa || null,
    } : null;

    return {
      ...base, verdict, results: r1(t.results), cpr: r0(t.cpr), cpm: r0(t.cpm), ctr: r1(t.ctr), frequency: r1(t.frequency),
      msgs: r0(t.msgs), leads: r0(t.leads), replyRate: r1(t.replyRate),
      baseline: bl ? { value: r0(target), source: bl.source, label: bl.label } : null,
      itemBaseline: itemTarget ? { value: r0(itemTarget), label: kpi.cpr > 0 ? "KPI" : "TB tài khoản kỳ này" } : null,
      real: realStats, notes,
      scale: scale.map((x) => slim(x, { verdict: x._v.label })),
      cut: cut.map((x) => slim(x, { verdict: x._v.label })),
      wasted: r0(wasted),
      campaigns: camps.slice(0, 12).map((x) => slim(x, { verdict: x._v.label, status: x.status, budget: r0(x.dailyBudget) })),
      topAds: ads.slice(0, 10).map((x) => slim(x, { verdict: x._v.label, quality: x.quality, freq: r1(x.frequency) })),
      keywords: isG ? kws.slice(0, 15).map((x) => slim(x, { verdict: x._v.label, match: x.match })) : undefined,
      byAgeGender: a.byAgeGender?.slice(0, 8).map((x) => slim({ ...x, name: `${x.gender} ${x.age}` })),
      byPlacement: a.byPlacement?.slice(0, 6).map((x) => slim({ ...x, name: `${x.platform} ${x.position}` })),
    };
  });
  return { since, until, days, accounts: out };
}
