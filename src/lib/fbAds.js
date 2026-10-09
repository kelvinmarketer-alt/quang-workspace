// Quảng cáo (bài/creative) trong từng tài khoản Meta — dùng CHUNG kết nối Facebook của Văn phòng AI
// (office_fb_ads: TK quảng cáo đã đồng bộ, office_fb: token System User mỗi BM). CHỈ ĐỌC, gọi thẳng Graph từ trình duyệt chủ.
// Tài khoản phụ (quyền Quảng cáo) → qua edge fn qws-proxy (token ở máy chủ).
import { supabase } from "./supabase.js";
import { goalOf, withGoal } from "./adsGoals.js";

const G = "https://graph.facebook.com/v23.0/";
const MSG = "onsite_conversion.messaging_conversation_started_7d";
let viaProxy = false;
export const setAdsProxy = (v) => { viaProxy = !!v; };
let tokenOf = null; // account_id → token

async function proxy(body) {
  const { data, error } = await supabase.functions.invoke("qws-proxy", { body });
  if (error) { let m = error.message; try { m = (await error.context?.json?.())?.error || m; } catch { /* bỏ qua */ } throw new Error(/Failed to send|not found|404/i.test(m) ? "Máy chủ chưa bật hàm qws-proxy (chủ cần deploy)" : m); }
  if (data?.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Facebook lỗi");
  return data;
}

async function accToken(accountId) {
  if (!tokenOf) {
    const [{ data: accs, error }, { data: conns }] = await Promise.all([
      supabase.from("office_fb_ads").select("account_id,fb_id"),
      supabase.from("office_fb").select("id,token"),
    ]);
    if (error) throw new Error(error.message);
    const t = new Map((conns || []).map((c) => [c.id, c.token]));
    tokenOf = new Map((accs || []).map((a) => [String(a.account_id), t.get(a.fb_id)]));
  }
  const tok = tokenOf.get(String(accountId));
  if (!tok) throw new Error("Tài khoản này chưa được kết nối bên Văn phòng AI (Kết nối → Facebook → tài khoản quảng cáo)");
  return tok;
}

// GET act_<id>/<edge> (chủ: token trực tiếp · tài khoản phụ: qua máy chủ); tự thử lại lỗi tạm thời của Facebook
async function actGet(accountId, edge, params, tries = 3) {
  if (viaProxy) return proxy({ action: "fbads", account_id: String(accountId), path: `act_${accountId}/${edge}`, params });
  const u = new URL(`${G}act_${accountId}/${edge}`);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  u.searchParams.set("access_token", await accToken(accountId));
  const j = await (await fetch(u)).json().catch(() => ({}));
  if (j.error) {
    if (tries > 1 && (j.error.is_transient || [1, 2, 4, 17, 32, 613].includes(j.error.code))) { await new Promise((r) => setTimeout(r, 1200)); return actGet(accountId, edge, params, tries - 1); }
    throw new Error(j.error.message || "Facebook lỗi");
  }
  return j;
}

const num = (v) => Number(v) || 0;
const act = (row, ...types) => { for (const t of types) { const a = (row?.actions || []).find((x) => x.action_type === t); if (a) return num(a.value); } return 0; };
const OBJ = { OUTCOME_ENGAGEMENT: "Tương tác", OUTCOME_LEADS: "Khách tiềm năng", OUTCOME_SALES: "Doanh số", OUTCOME_TRAFFIC: "Lưu lượng", OUTCOME_AWARENESS: "Nhận biết", OUTCOME_APP_PROMOTION: "Ứng dụng", MESSAGES: "Tin nhắn", LINK_CLICKS: "Lưu lượng", POST_ENGAGEMENT: "Tương tác", VIDEO_VIEWS: "Xem video", REACH: "Tiếp cận", BRAND_AWARENESS: "Nhận biết", LEAD_GENERATION: "Khách tiềm năng", CONVERSIONS: "Chuyển đổi" };
const OPT = { CONVERSATIONS: "Tin nhắn", LEAD_GENERATION: "Lead", LINK_CLICKS: "Click", POST_ENGAGEMENT: "Tương tác", REACH: "Tiếp cận", IMPRESSIONS: "Hiển thị", THRUPLAY: "ThruPlay", OFFSITE_CONVERSIONS: "Chuyển đổi web", LANDING_PAGE_VIEWS: "Xem trang đích", QUALITY_LEAD: "Lead chất lượng", PROFILE_VISIT: "Xem trang cá nhân", VALUE: "Giá trị", AD_RECALL_LIFT: "Ghi nhớ QC" };
const CTA = { MESSAGE_PAGE: "Gửi tin nhắn", LEARN_MORE: "Tìm hiểu thêm", SHOP_NOW: "Mua ngay", CALL_NOW: "Gọi ngay", SIGN_UP: "Đăng ký", BOOK_TRAVEL: "Đặt ngay", CONTACT_US: "Liên hệ", WHATSAPP_MESSAGE: "WhatsApp", GET_OFFER: "Nhận ưu đãi", APPLY_NOW: "Ứng tuyển", ORDER_NOW: "Đặt hàng", SEND_MESSAGE: "Gửi tin nhắn", NO_BUTTON: "" };
const STATUS = { ACTIVE: ["Đang chạy", "emerald"], PAUSED: ["Tạm dừng", "slate"], CAMPAIGN_PAUSED: ["Chiến dịch dừng", "slate"], ADSET_PAUSED: ["Nhóm QC dừng", "slate"], PENDING_REVIEW: ["Đang duyệt", "amber"], IN_PROCESS: ["Đang xử lý", "amber"], DISAPPROVED: ["Bị từ chối", "rose"], WITH_ISSUES: ["Có vấn đề", "rose"], PREAPPROVED: ["Đã duyệt trước", "sky"], ARCHIVED: ["Lưu trữ", "slate"], DELETED: ["Đã xoá", "slate"] };
export const statusOf = (s) => STATUS[s] || [s || "—", "slate"];

// Mục tiêu từng chiến dịch của 1 TK: { byId: {id: goal}, byName: {name: goal} } (theo optimization_goal của nhóm QC)
const GOAL_CACHE = new Map();
export async function loadCampaignGoals(accountId) {
  const c = GOAL_CACHE.get(accountId);
  if (c && Date.now() - c.at < 1800000) return c.v;
  const j = await actGet(accountId, "campaigns", { fields: "id,name,objective,adsets.limit(50){optimization_goal}", limit: "300" });
  const byId = {}, byName = {};
  for (const x of j.data || []) { const g = goalOf(x.objective, (x.adsets?.data || []).map((a) => a.optimization_goal)); byId[x.id] = g; if (x.name) byName[x.name] = g; }
  const v = { byId, byName };
  GOAL_CACHE.set(accountId, { at: Date.now(), v });
  return v;
}

// Quảng cáo của 1 TK trong kỳ: (a) đang chạy + (b) có chi tiêu trong kỳ (kể cả đã dừng). Kèm creative + số liệu kỳ.
export async function loadAccountAds(accountId, since, until) {
  const tr = JSON.stringify({ since, until });
  const FIELDS = `id,name,effective_status,created_time,campaign{name,objective},adset{name,daily_budget,lifetime_budget,optimization_goal},creative{thumbnail_url,image_url,body,title,object_type,call_to_action_type,effective_object_story_id,instagram_permalink_url},insights.time_range(${tr}){spend,impressions,reach,frequency,ctr,cpc,cpm,clicks,actions,video_thruplay_watched_actions}`;
  // id các QC có tiêu tiền trong kỳ
  const spentRows = await actGet(accountId, "insights", { level: "ad", fields: "ad_id,spend", time_range: tr, filtering: [{ field: "spend", operator: "GREATER_THAN", value: 0 }], limit: "300" }).then((j) => j.data || []).catch(() => []);
  const spentIds = spentRows.map((r) => r.ad_id);
  const [running, spent] = await Promise.all([
    actGet(accountId, "ads", { fields: FIELDS, effective_status: ["ACTIVE"], limit: "100" }).then((j) => j.data || []),
    spentIds.length ? actGet(accountId, "ads", { fields: FIELDS, filtering: [{ field: "id", operator: "IN", value: spentIds.slice(0, 100) }], limit: "100" }).then((j) => j.data || []) : Promise.resolve([]),
  ]);
  const map = new Map();
  for (const a of [...running, ...spent]) map.set(a.id, a);
  return [...map.values()].map((a) => {
    const i = a.insights?.data?.[0] || {};
    const msgs = act(i, MSG), leads = act(i, "lead", "onsite_conversion.lead_grouped"), results = msgs + leads, spend = num(i.spend);
    const c = a.creative || {};
    const goal = goalOf(a.campaign?.objective, a.adset?.optimization_goal ? [a.adset.optimization_goal] : []);
    return withGoal({
      id: a.id, name: a.name, status: a.effective_status, running: a.effective_status === "ACTIVE", created: a.created_time,
      campaign: a.campaign?.name, objective: OBJ[a.campaign?.objective] || a.campaign?.objective || "",
      adset: a.adset?.name, optimize: OPT[a.adset?.optimization_goal] || a.adset?.optimization_goal || "",
      dailyBudget: a.adset?.daily_budget ? num(a.adset.daily_budget) : null, lifetimeBudget: a.adset?.lifetime_budget ? num(a.adset.lifetime_budget) : null,
      img: c.image_url || c.thumbnail_url || null, body: (c.body || "").trim(), title: c.title || "", type: c.object_type || "", cta: CTA[c.call_to_action_type] ?? c.call_to_action_type ?? "",
      postUrl: c.instagram_permalink_url || (c.effective_object_story_id ? `https://www.facebook.com/${c.effective_object_story_id}` : null),
      spend, impressions: num(i.impressions), reach: num(i.reach), frequency: num(i.frequency), ctr: num(i.ctr), cpc: num(i.cpc), cpm: num(i.cpm), clicks: num(i.clicks),
      msgs, leads, results, cpr: results > 0 ? spend / results : null,
      engagement: act(i, "post_engagement"), linkClicks: act(i, "link_click"), thruplay: num((i.video_thruplay_watched_actions || [])[0]?.value),
      pageLikes: act(i, "like"), video3s: act(i, "video_view"),
    }, goal);
  }).sort((x, y) => (y.running - x.running) || y.spend - x.spend);
}
