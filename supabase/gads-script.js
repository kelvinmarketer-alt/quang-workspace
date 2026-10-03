// Quang Workspace — đẩy số liệu Google Ads về module "Quảng cáo" (chạy MỖI GIỜ).
// Dán vào Google Ads → Công cụ → Hành động hàng loạt → Tập lệnh → (+) → dán → Uỷ quyền → Lưu → Tần suất: Hằng giờ.
// Đặt ở MCC (tự quét mọi tài khoản con) HOẶC trong 1 tài khoản lẻ — cùng 1 đoạn code.
var ENDPOINT = 'https://dbfffwtnxhytcoczhxhf.supabase.co/functions/v1/qws-meta-ads';
var INGEST_KEY = '__INGEST_KEY__';
var EXCLUDE = ['405-631-8580']; // tài khoản KHÔNG lấy (FPT-HPG)

function main() {
  var status = post({ mode: 'gads_status' });
  var earliest = (status && status.earliest) || {};
  if (typeof AdsManagerApp !== 'undefined') {
    var it = AdsManagerApp.accounts().get();
    while (it.hasNext()) {
      var acc = it.next();
      if (EXCLUDE.indexOf(acc.getCustomerId()) >= 0) continue;
      AdsManagerApp.select(acc);
      try { collect(earliest); } catch (e) { Logger.log(acc.getCustomerId() + ' lỗi: ' + e); }
    }
  } else {
    collect(earliest);
  }
}

function collect(earliest) {
  var a = AdsApp.currentAccount();
  var cid = a.getCustomerId();
  var today = Utilities.formatDate(new Date(), a.getTimeZone(), 'yyyy-MM-dd');
  var have = earliest[cid.replace(/-/g, '')];
  var full = !have || have > shift(today, -60); // lần đầu → nạp lùi 120 ngày, sau đó chỉ 7 ngày gần nhất
  var from = shift(today, full ? -120 : -6);

  var camps = [];
  var r = AdsApp.search(
    "SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, " +
    "metrics.search_impression_share, metrics.search_budget_lost_impression_share " +
    "FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + today + "' AND metrics.impressions > 0");
  while (r.hasNext()) {
    var x = r.next(), m = x.metrics || {};
    camps.push({
      date: x.segments.date, id: String(x.campaign.id), name: x.campaign.name, status: x.campaign.status,
      channel: x.campaign.advertisingChannelType, cost: Number(m.costMicros || 0) / 1e6, imp: Number(m.impressions || 0),
      clicks: Number(m.clicks || 0), conv: Number(m.conversions || 0), value: Number(m.conversionsValue || 0),
      sis: m.searchImpressionShare == null ? null : Number(m.searchImpressionShare),
      blis: m.searchBudgetLostImpressionShare == null ? null : Number(m.searchBudgetLostImpressionShare),
    });
  }
  if (!camps.length) return; // tài khoản không chạy trong kỳ → bỏ qua

  var kws = [];
  var kr = AdsApp.search(
    "SELECT segments.date, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, " +
    "ad_group_criterion.keyword.match_type, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions " +
    "FROM keyword_view WHERE segments.date BETWEEN '" + shift(today, full ? -35 : -6) + "' AND '" + today + "' AND metrics.cost_micros > 0");
  while (kr.hasNext()) {
    var k = kr.next(), km = k.metrics || {};
    kws.push({
      date: k.segments.date, ag: String(k.adGroup.id), id: String(k.adGroupCriterion.criterionId),
      text: k.adGroupCriterion.keyword.text, match: k.adGroupCriterion.keyword.matchType, campaign: k.campaign.name,
      cost: Number(km.costMicros || 0) / 1e6, imp: Number(km.impressions || 0), clicks: Number(km.clicks || 0), conv: Number(km.conversions || 0),
    });
  }

  // Chuyển đổi theo TỪNG hành động chuyển đổi đã cài (Gọi hotline, Zalo, Form...)
  var convs = [];
  var cr = AdsApp.search(
    "SELECT segments.date, campaign.id, segments.conversion_action_name, segments.conversion_action_category, " +
    "metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM campaign " +
    "WHERE segments.date BETWEEN '" + from + "' AND '" + today + "' AND metrics.all_conversions > 0");
  while (cr.hasNext()) {
    var c = cr.next(), cm = c.metrics || {};
    convs.push({
      date: c.segments.date, id: String(c.campaign.id), action: c.segments.conversionActionName, cat: c.segments.conversionActionCategory,
      conv: Number(cm.conversions || 0), value: Number(cm.conversionsValue || 0), all: Number(cm.allConversions || 0),
    });
  }
  // Danh sách hành động chuyển đổi đang bật (để hiện cả loại chưa phát sinh)
  var actions = [];
  try {
    var ar = AdsApp.search("SELECT conversion_action.name, conversion_action.category, conversion_action.primary_for_goal, " +
      "conversion_action.include_in_conversions_metric FROM conversion_action WHERE conversion_action.status = 'ENABLED'");
    while (ar.hasNext()) {
      var ca = ar.next().conversionAction;
      actions.push({ name: ca.name, category: ca.category, primary: !!ca.primaryForGoal, counted: ca.includeInConversionsMetric !== false });
    }
  } catch (e) { Logger.log('conversion_action: ' + e); }

  // Trạng thái tài khoản + ngân sách tài khoản (chỉ có khi TK dùng "ngân sách tài khoản"; TK nạp trước thì không có → nhập sổ trong app)
  var status = null, budget = null;
  try { var sr = AdsApp.search("SELECT customer.status FROM customer"); if (sr.hasNext()) status = sr.next().customer.status; } catch (e) {}
  try {
    var br = AdsApp.search("SELECT account_budget.amount_served_micros, account_budget.approved_spending_limit_micros, " +
      "account_budget.approved_spending_limit_type, account_budget.adjusted_spending_limit_micros FROM account_budget " +
      "WHERE account_budget.status = 'APPROVED'");
    while (br.hasNext()) {
      var ab = br.next().accountBudget;
      var lim = ab.adjustedSpendingLimitMicros != null ? ab.adjustedSpendingLimitMicros : ab.approvedSpendingLimitMicros;
      if (lim != null && ab.approvedSpendingLimitType !== 'INFINITE') {
        budget = { limit: Number(lim) / 1e6, remaining: (Number(lim) - Number(ab.amountServedMicros || 0)) / 1e6 };
      }
    }
  } catch (e) {}

  var policy = 0;
  var pr = AdsApp.search(
    "SELECT ad_group_ad.ad.id FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' " +
    "AND campaign.status = 'ENABLED' AND ad_group_ad.policy_summary.approval_status IN ('DISAPPROVED', 'APPROVED_LIMITED')");
  while (pr.hasNext()) { pr.next(); policy++; }

  var res = post({
    mode: 'gads_ingest',
    account: { cid: cid, name: a.getName(), currency: a.getCurrencyCode(), policyIssues: policy, status: status, budget: budget },
    campaigns: camps, keywords: kws, convs: convs, actions: actions,
  });
  Logger.log(cid + ' ' + a.getName() + ': ' + JSON.stringify(res));
}

function shift(iso, n) {
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function post(obj) {
  var resp = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-ingest-key': INGEST_KEY }, payload: JSON.stringify(obj),
  });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) throw new Error('Quang Workspace trả lỗi ' + code + ': ' + text);
  return JSON.parse(text);
}
