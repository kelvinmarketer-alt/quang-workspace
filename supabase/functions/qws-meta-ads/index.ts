// Edge Function: qws-meta-ads — số liệu Meta Ads (LIVE) + Google Ads (script đẩy mỗi giờ) cho module "Quảng cáo".
// Đọc trực tiếp Marketing API bằng token System User của TỪNG BM (không cần BM mẹ).
// Danh sách TKQC + token lưu ở bảng qws_ads_accounts (chỉ service role đọc) — chủ thêm/sửa trong app (Cài đặt).
//
// 3 chế độ (body.mode):
//   "report" (mặc định) — app gọi khi mở module: { since, until, compare } → số liệu từng tài khoản.
//                         Chỉ CHỦ workspace (email == OWNER_EMAIL).
//   "watch"  — pg_cron 15 phút/lần: soát số HÔM NAY → cảnh báo (Web Push + Telegram nếu có).
//   "daily"  — pg_cron 6h sáng: tóm tắt HÔM QUA + cảnh báo tần suất.
//   "config_list" / "config_discover" / "config_save" / "config_update" / "config_delete" — quản lý TKQC + token (chỉ CHỦ).
//   watch/daily xác thực bằng header x-cron-key, so với khoá trong Vault (RPC qws_ads_check_cron_key).
//
// Secrets: OWNER_EMAIL, (tuỳ chọn) TELEGRAM_TOKEN, TELEGRAM_CHAT_ID. SUPABASE_URL/ANON/SERVICE_ROLE Supabase tự cấp.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const GRAPH = "https://graph.facebook.com/v21.0/";

// group: "brand" = chạy thương hiệu (đo độ phủ) · "conv" = chuyển đổi (đo tin nhắn/lead)
// services: true = gom chiến dịch theo dịch vụ TMV (xăm mày/môi nam-nữ, đào tạo)
// KNOWN = gợi ý mặc định khi "Lấy danh sách TKQC" từ token (tên/nhóm đã chốt với user).
const KNOWN: Record<string, { name: string; brand: string; grp: string; services?: boolean }> = {
  "2275948969610920": { name: "Nhậu Phi Trường", brand: "Phi Trường", grp: "brand" },
  "1117093690651938": { name: "Mì Cay Busansan", brand: "Mì Cay", grp: "brand" },
  "1998481310677042": { name: "NSTT · Sản phẩm", brand: "Nông sản Tuấn Tú", grp: "conv" },
  "1945007079637982": { name: "NSTT · Tuyển dụng", brand: "Nông sản Tuấn Tú", grp: "conv" },
  "3035383220140594": { name: "Hebrow (Aera)", brand: "TMV", grp: "conv", services: true },
  "2056663328284029": { name: "Lina Trương", brand: "TMV", grp: "conv", services: true },
};
const TABLE = "qws_ads_accounts";
async function loadAccounts(all = false) {
  let q = admin().from(TABLE).select("*").order("sort").order("created_at");
  if (!all) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error("Đọc bảng " + TABLE + ": " + error.message);
  return (data || []).map((r: any) => ({ id: r.id, name: r.name, brand: r.brand, group: r.grp, services: r.services, active: r.active, sort: r.sort, token: r.token }));
}
const safe = (a: any) => ({ id: a.id, name: a.name, brand: a.brand, group: a.group, services: a.services, active: a.active, sort: a.sort, tokenTail: a.token ? "…" + String(a.token).slice(-6) : "" });

const MSG = "onsite_conversion.messaging_conversation_started_7d";
const BASE_FIELDS = "spend,impressions,reach,frequency,cpm,ctr,cpc,clicks,actions,action_values,video_thruplay_watched_actions";
const PURCHASE = ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase", "omni_purchase"];
// Tiền tệ "offset 1" của Meta (ngân sách trả về số nguyên, không phải xu) — còn lại chia 100
const ZERO_DEC = new Set(["VND", "JPY", "KRW", "IDR", "CLP", "COP", "CRC", "HUF", "ISK", "PYG", "TWD"]);

// ---------- Graph helpers ----------
async function gget(path: string, params: Record<string, string>, token: string) {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(GRAPH + path + "?" + q.toString());
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error((d.error && d.error.message) || "HTTP " + r.status);
  return d;
}
async function gall(path: string, params: Record<string, string>, token: string, max = 5) {
  let d = await gget(path, params, token);
  let out = d.data || [];
  for (let i = 1; i < max && d.paging && d.paging.next; i++) {
    const r = await fetch(d.paging.next);
    d = await r.json();
    if (d.error) break;
    out = out.concat(d.data || []);
  }
  return out;
}
const timeArgs = (since: string, until: string) =>
  since === "today" ? { date_preset: "today" } : { time_range: JSON.stringify({ since, until }) };

// ---------- Chỉ số ----------
const num = (v: unknown) => Number(v) || 0;
function act(row: any, type: string) {
  const a = (row.actions || []).find((x: any) => x.action_type === type);
  return a ? num(a.value) : 0;
}
// giá trị khác 0 đầu tiên theo thứ tự loại hành động (tránh cộng trùng purchase/omni_purchase)
function firstOf(list: any[] | undefined, types: string[]) {
  for (const t of types) {
    const a = (list || []).find((x: any) => x.action_type === t);
    const v = a ? num(a.value) : 0;
    if (v) return v;
  }
  return 0;
}
// Chỉ số dẫn xuất (dùng chung metrics + sumMetrics). results = tin nhắn + lead (KHÔNG đổi).
function derive(m: any) {
  const results = m.msgs + m.leads;
  const out: any = {
    ...m, results, cpr: results > 0 ? m.spend / results : null,
    replyRate: m.msgs > 0 ? (m.firstReply / m.msgs) * 100 : null,
    clickToResult: m.linkClicks > 0 ? (results / m.linkClicks) * 100 : null,
  };
  if (m.purchases > 0) {
    out.cpp = m.spend / m.purchases;
    out.roas = m.spend > 0 ? m.purchaseValue / m.spend : null;
  }
  return out;
}
function metrics(row: any) {
  if (!row) row = {};
  const leads = act(row, "lead") || act(row, "onsite_conversion.lead_grouped");
  const m = {
    spend: num(row.spend), impressions: num(row.impressions), reach: num(row.reach),
    frequency: num(row.frequency), cpm: num(row.cpm), ctr: num(row.ctr), cpc: num(row.cpc), clicks: num(row.clicks),
    msgs: act(row, MSG), leads,
    linkClicks: act(row, "link_click"), engagement: act(row, "post_engagement"),
    video3s: act(row, "video_view"), pageLikes: act(row, "like"),
    thruplay: num((row.video_thruplay_watched_actions || [])[0]?.value),
    firstReply: act(row, "onsite_conversion.messaging_first_reply"),
    purchases: firstOf(row.actions, PURCHASE), purchaseValue: firstOf(row.action_values, PURCHASE),
    landingViews: act(row, "landing_page_view"),
  };
  return derive(m);
}

// Tên chiến dịch → dịch vụ TMV (port từ lina-fb-bot/fb_report.py map_service)
function noAccent(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}
function mapService(name: string) {
  const t = noAccent(name).replace(/[^a-z0-9]+/g, " ").trim();
  const has = (...w: string[]) => w.every((x) => new RegExp("(?<![a-z0-9])" + x + "(?![a-z0-9])").test(t));
  const squash = t.replace(/ /g, "");
  if (has("dao", "tao") || squash.includes("daotao") || has("hoc", "vien") || t.includes("training")) return "Đào tạo";
  const isMay = has("may") || squash.includes("phunmay");
  const isMoi = has("moi") || squash.includes("phunmoi");
  if (isMay && has("nam")) return "Xăm mày nam";
  if (isMay && has("nu")) return "Xăm mày nữ";
  if (isMoi && has("nam")) return "Xăm môi nam";
  if (isMoi && has("nu")) return "Xăm môi nữ";
  if (isMay) return "Xăm mày";
  if (isMoi) return "Xăm môi";
  return (name || "").replace(/\s*[-–|]?\s*(b[aả]n sao|copy)\s*\d*\s*$/i, "").trim() || name;
}
function sumMetrics(list: any[]) {
  const keys = ["spend", "impressions", "clicks", "msgs", "leads", "linkClicks", "engagement", "video3s", "pageLikes", "thruplay",
    "firstReply", "purchases", "purchaseValue", "landingViews"];
  const s0: any = {};
  for (const k of keys) s0[k] = list.reduce((a, x) => a + (x[k] || 0), 0);
  const s: any = derive(s0);
  s.cpm = s.impressions > 0 ? (s.spend / s.impressions) * 1000 : 0;
  s.ctr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
  s.cpc = s.clicks > 0 ? s.spend / s.clicks : 0;
  return s;
}

// ---------- Lấy 1 tài khoản ----------
// light = chỉ tổng + trạng thái (cho cron soát 15 phút) — bỏ daily/chiến dịch/quảng cáo cho đỡ tốn lượt gọi API
async function fetchAccount(acc: any, since: string, until: string, prev: { since: string; until: string } | null, light = false) {
  const token = acc.token || "";
  const base = { id: acc.id, name: acc.name, brand: acc.brand, group: acc.group, services: !!acc.services };
  if (!token) return { ...base, error: "Chưa có token" };
  const act_ = "act_" + acc.id;
  const t = timeArgs(since, until);
  const conv = !light && acc.group === "conv";
  try {
    const [info, tot, daily, camps, ads, bad, prevTot, campMeta, adsets, byAG, byPl] = await Promise.all([
      gget(act_, { fields: "name,currency,account_status,disable_reason,amount_spent,spend_cap,balance,timezone_name,is_prepay_account" }, token),
      gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, ...t }, token, 1),
      light ? [] : gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, time_increment: "1", limit: "100", ...t }, token, 4),
      light ? [] : gall(act_ + "/insights", { level: "campaign", fields: "campaign_id,campaign_name," + BASE_FIELDS, limit: "200", ...t }, token, 3),
      light ? [] : gall(act_ + "/insights", { level: "ad", fields: "ad_id,ad_name,adset_name,campaign_name,quality_ranking,engagement_rate_ranking,conversion_rate_ranking," + BASE_FIELDS, limit: "200", sort: "spend_descending", ...t }, token, 2),
      gall(act_ + "/ads", { fields: "name,effective_status", effective_status: JSON.stringify(["DISAPPROVED", "WITH_ISSUES"]), limit: "50" }, token, 1).catch(() => []),
      prev ? gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, ...timeArgs(prev.since, prev.until) }, token, 1) : Promise.resolve(null),
      // ---- mới (chỉ khi !light; lỗi quyền/breakdown không làm hỏng cả tài khoản) ----
      light ? [] : gall(act_ + "/campaigns", { fields: "id,name,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,start_time", limit: "200" }, token, 2).catch(() => []),
      conv ? gall(act_ + "/insights", { level: "adset", fields: "adset_id,adset_name,campaign_name," + BASE_FIELDS, limit: "200", ...t }, token, 2).catch(() => []) : [],
      conv ? gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, breakdowns: "age,gender", limit: "200", ...t }, token, 2).catch(() => []) : [],
      conv ? gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, breakdowns: "publisher_platform,platform_position", limit: "200", ...t }, token, 2).catch(() => []) : [],
    ]);
    const bySpend = (a: any, b: any) => b.spend - a.spend;
    const campaigns: any[] = camps.map((c: any) => ({ id: c.campaign_id, name: c.campaign_name, service: acc.services ? mapService(c.campaign_name) : null, ...metrics(c) }))
      .sort(bySpend);
    let services = null;
    if (acc.services) {
      const g: Record<string, any[]> = {};
      for (const c of campaigns) (g[c.service] = g[c.service] || []).push(c);
      services = Object.entries(g).map(([name, list]) => ({ name, ...sumMetrics(list) })).sort(bySpend);
    }
    // Gắn trạng thái/mục tiêu/ngân sách chiến dịch; thêm chiến dịch ĐANG BẬT mà không tiêu trong kỳ (số 0)
    const div = ZERO_DEC.has(String(info.currency || "").toUpperCase()) ? 1 : 100;
    const budget = (v: unknown) => (v == null || v === "" ? null : num(v) / div);
    const metaById: Record<string, any> = {};
    for (const c of campMeta || []) metaById[c.id] = c;
    const withMeta = (row: any, c: any) => (c ? {
      ...row, status: c.effective_status, objective: c.objective, dailyBudget: budget(c.daily_budget), lifetimeBudget: budget(c.lifetime_budget),
      bidStrategy: c.bid_strategy || null, startTime: c.start_time || null,
    } : row);
    for (let i = 0; i < campaigns.length; i++) campaigns[i] = withMeta(campaigns[i], metaById[campaigns[i].id]);
    const seen = new Set(campaigns.map((c: any) => c.id));
    for (const c of campMeta || []) {
      if (c.effective_status !== "ACTIVE" || seen.has(c.id)) continue;
      campaigns.push(withMeta({ id: c.id, name: c.name, service: acc.services ? mapService(c.name) : null, idle: true, ...metrics(null) }, c));
    }
    return {
      ...base,
      currency: info.currency, status: info.account_status, disableReason: info.disable_reason,
      amountSpent: num(info.amount_spent), spendCap: num(info.spend_cap), owed: info.is_prepay_account ? 0 : num(info.balance), prepay: !!info.is_prepay_account, timezone: info.timezone_name,
      totals: metrics(tot[0]),
      prev: prevTot ? metrics(prevTot[0]) : null,
      daily: daily.map((d: any) => ({ date: d.date_start, ...metrics(d) })),
      campaigns, services,
      ads: ads.map((a: any) => ({
        id: a.ad_id, name: a.ad_name, campaign: a.campaign_name, adset: a.adset_name || null,
        quality: a.quality_ranking || null, engRank: a.engagement_rate_ranking || null, convRank: a.conversion_rate_ranking || null,
        ...metrics(a),
      })),
      issues: (bad || []).map((a: any) => ({ name: a.name, status: a.effective_status })),
      ...(conv ? {
        adsets: (adsets || []).map((s: any) => ({ id: s.adset_id, name: s.adset_name, campaign: s.campaign_name, ...metrics(s) })).sort(bySpend),
        byAgeGender: (byAG || []).map((r: any) => ({ age: r.age, gender: r.gender, ...metrics(r) })).filter((r: any) => r.spend > 0).sort(bySpend),
        byPlacement: (byPl || []).map((r: any) => ({ platform: r.publisher_platform, position: r.platform_position, ...metrics(r) })).filter((r: any) => r.spend > 0).sort(bySpend),
      } : {}),
    };
  } catch (e) {
    return { ...base, error: String((e as Error).message || e) };
  }
}

// ---------- Ngày giờ VN ----------
const vnNow = () => new Date(Date.now() + 7 * 3600000);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoOf(new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000));
const fmt = (v: number) => Math.round(v || 0).toLocaleString("vi-VN") + "đ";

// ---------- Cảnh báo ----------
function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
async function notify(title: string, lines: string[]) {
  const body = lines.join("\n");
  const sent: string[] = [];
  const tg = Deno.env.get("TELEGRAM_TOKEN"), chat = Deno.env.get("TELEGRAM_CHAT_ID");
  if (tg && chat) {
    const r = await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: `${title}\n\n${body}`, disable_web_page_preview: true }),
    }).catch(() => null);
    if (r && r.ok) sent.push("telegram");
  }
  try {
    const supa = admin();
    const owner = (Deno.env.get("OWNER_EMAIL") || "").toLowerCase();
    let user_id: string | undefined;
    if (owner) {
      const { data } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
      user_id = data?.users?.find((u: any) => (u.email || "").toLowerCase() === owner)?.id;
    }
    const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/qws-send-push", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") },
      body: JSON.stringify({ title, body: lines.slice(0, 4).join(" · "), url: "/quang-cao", tag: "qws-ads", user_id }),
    });
    if (r.ok) sent.push("push");
  } catch (_) { /* push là phụ */ }
  return sent;
}
// Mỗi cảnh báo gửi tối đa 1 lần/ngày (khoá = ngày|tài khoản|loại)
async function freshKeys(found: { key: string; text: string }[]) {
  if (!found.length) return [];
  const supa = admin();
  const { data } = await supa.from("qws_ads_alerts").select("key").in("key", found.map((f) => f.key));
  const seen = new Set((data || []).map((r: any) => r.key));
  const fresh = found.filter((f) => !seen.has(f.key));
  if (fresh.length) await supa.from("qws_ads_alerts").upsert(fresh.map((f) => ({ key: f.key, text: f.text, account_id: f.key.split("|")[1] || null })));
  return fresh.map((f) => f.key);
}

// ---------- Số dư (sổ nạp tiền) ----------
// Google (TK trả trước) + Meta trả trước KHÔNG có API số dư → chủ nhập "số dư hiện tại" (anchor) + các lần "nạp thêm" (topup).
// Số dư = anchor + nạp sau anchor − chi phí từ lúc anchor (cost_at = chi phí trong ngày đã có lúc nhập anchor).
// Google có account budget (ngân sách tài khoản) → dùng số đó thay sổ.
async function ledgers(ids: string[]) {
  if (!ids.length) return {} as Record<string, any[]>;
  const { data } = await admin().from("qws_ads_balance").select("*").in("account_id", ids).order("at");
  const out: Record<string, any[]> = {};
  for (const r of data || []) (out[r.account_id] = out[r.account_id] || []).push(r);
  return out;
}
const vnDateOf = (ts: string) => isoOf(new Date(Date.parse(ts) + 7 * 3600000));
function fromLedger(rows: any[] | undefined, costSince: (d: string) => number) {
  const anchor = [...(rows || [])].reverse().find((r) => r.kind === "anchor");
  if (!anchor) return null;
  const topups = (rows || []).filter((r) => r.kind === "topup" && r.at > anchor.at).reduce((a, r) => a + num(r.amount), 0);
  const spent = costSince(vnDateOf(anchor.at)) - num(anchor.cost_at);
  return { balance: num(anchor.amount) + topups - spent, source: "ledger", anchorAt: anchor.at };
}
function withDays(b: any, avg7: number) {
  if (!b) return null;
  return { ...b, avgDaily: avg7, daysLeft: avg7 > 0 ? b.balance / avg7 : null };
}
// Meta: chi phí từ ngày d tới hôm nay + TB 7 ngày (chỉ gọi cho TK có sổ)
async function metaBalance(acc: any, rows: any[] | undefined) {
  const anchor = [...(rows || [])].reverse().find((r) => r.kind === "anchor");
  if (!anchor || !acc.token) return null;
  const today = isoOf(vnNow());
  const [since, week] = await Promise.all([
    gall("act_" + acc.id + "/insights", { level: "account", fields: "spend", time_range: JSON.stringify({ since: vnDateOf(anchor.at), until: today }) }, acc.token, 1),
    gall("act_" + acc.id + "/insights", { level: "account", fields: "spend", time_range: JSON.stringify({ since: addDays(today, -7), until: addDays(today, -1) }) }, acc.token, 1),
  ]);
  const spentSince = num(since[0]?.spend);
  return withDays(fromLedger(rows, () => spentSince), num(week[0]?.spend) / 7);
}

function lowBalance(found: { key: string; text: string }[], today: string, id: string, name: string, bal: any) {
  if (!bal) return;
  const k = (t: string) => `${today}|${id}|${t}`;
  if (bal.balance <= 0) found.push({ key: k("balance0"), text: `🛑 ${name}: HẾT tiền quảng cáo (số dư ${fmt(bal.balance)}) — nạp ngay` });
  else if (bal.daysLeft != null && bal.daysLeft < 2)
    found.push({ key: k("balance"), text: `💰 ${name}: số dư còn ${fmt(bal.balance)} ≈ ${bal.daysLeft.toFixed(1)} ngày chạy (TB ${fmt(bal.avgDaily)}/ngày) — sắp hết` });
}

async function watch() {
  const ACCOUNTS = await loadAccounts();
  const today = isoOf(vnNow());
  const from = addDays(today, -7), to = addDays(today, -1);
  const [now, base] = await Promise.all([
    Promise.all(ACCOUNTS.map((a) => fetchAccount(a, "today", "today", null, true))),
    Promise.all(ACCOUNTS.map((a) => fetchAccount(a, from, to, null, true))),
  ]);
  const found: { key: string; text: string }[] = [];
  now.forEach((a: any, i: number) => {
    if (a.error) return;
    const b: any = base[i];
    const t = a.totals, k = (type: string) => `${today}|${a.id}|${type}`;
    if (a.status && a.status !== 1) found.push({ key: k("status"), text: `⛔ ${a.name}: tài khoản không hoạt động (mã ${a.status})` });
    if (a.issues?.length) found.push({ key: k("issues"), text: `🚫 ${a.name}: ${a.issues.length} quảng cáo bị từ chối/có vấn đề` });
    if (a.spendCap > 0 && a.amountSpent / a.spendCap > 0.9) found.push({ key: k("cap"), text: `💸 ${a.name}: đã tiêu ${Math.round((a.amountSpent / a.spendCap) * 100)}% giới hạn chi tiêu` });
    const bm0 = b && !b.error ? b.totals.cpm : 0;
    if (bm0 && t.cpm && t.spend >= 50000 && t.cpm > bm0 * 1.3)
      found.push({ key: k("cpm"), text: `📈 ${a.name}: CPM hôm nay ${fmt(t.cpm)} (+${Math.round((t.cpm / bm0 - 1) * 100)}% so với TB 7 ngày ${fmt(bm0)})` });
    if (a.group === "brand" && b && !b.error && b.totals.frequency > 3)
      found.push({ key: k("freq"), text: `🔁 ${a.name}: tần suất 7 ngày ${b.totals.frequency.toFixed(2)} (>3) — khách xem lặp, nên đổi mẫu/mở rộng tệp` });
    if (a.group === "conv") {
      if (t.spend >= 100000 && t.results === 0) found.push({ key: k("noresult"), text: `⚠️ ${a.name}: hôm nay tiêu ${fmt(t.spend)} nhưng 0 tin nhắn/lead` });
      const bc = b && !b.error ? b.totals.cpr : null;
      if (bc && t.cpr && t.spend >= 50000 && t.cpr > bc * 1.3)
        found.push({ key: k("cpr"), text: `📈 ${a.name}: giá/kết quả hôm nay ${fmt(t.cpr)} (+${Math.round((t.cpr / bc - 1) * 100)}% so với TB 7 ngày ${fmt(bc)})` });
    }
  });
  // Số dư Meta (TK trả trước có sổ nạp tiền)
  const mLed = await ledgers(ACCOUNTS.map((a: any) => a.id));
  for (const acc of ACCOUNTS) {
    const bal = mLed[acc.id] ? await metaBalance(acc, mLed[acc.id]).catch(() => null) : null;
    lowBalance(found, today, acc.id, acc.name, bal);
  }
  // Google: số trong bảng (script đẩy mỗi giờ)
  const [gNow, gBase] = await Promise.all([gadsReport(today, today, null, true), gadsReport(from, to, null, true)]);
  const hourVN = vnNow().getUTCHours();
  gNow.forEach((a: any, i: number) => {
    const t = a.totals, b = gBase[i]?.totals, k = (type: string) => `${today}|${a.id}|${type}`;
    if (a.issues.length) found.push({ key: k("issues"), text: `🚫 ${a.name}: ${a.issues[0].name}` });
    if (a.status && a.status !== "ENABLED") found.push({ key: k("status"), text: `⛔ ${a.name}: tài khoản Google ở trạng thái ${a.status}` });
    if (b?.cpc && t.cpc && t.clicks >= 10 && t.cpc > b.cpc * 1.3)
      found.push({ key: k("cpc"), text: `📈 ${a.name}: CPC hôm nay ${fmt(t.cpc)} (+${Math.round((t.cpc / b.cpc - 1) * 100)}% so với TB 7 ngày ${fmt(b.cpc)})` });
    lowBalance(found, today, a.id, a.name, a.bal);
    if (hourVN >= 9 && (!a.lastSync || Date.now() - Date.parse(a.lastSync) > 3 * 3600000))
      found.push({ key: k("stale"), text: `⏸ ${a.name}: script Google Ads chưa đẩy số >3 giờ — kiểm tra lịch chạy script` });
    if (t.spend >= 100000 && t.results === 0) found.push({ key: k("noresult"), text: `⚠️ ${a.name}: hôm nay tiêu ${fmt(t.spend)} nhưng 0 chuyển đổi (Google có thể trễ vài giờ)` });
    if (b?.cpr && t.cpr && t.spend >= 50000 && t.cpr > b.cpr * 1.3)
      found.push({ key: k("cpr"), text: `📈 ${a.name}: CPA hôm nay ${fmt(t.cpr)} (+${Math.round((t.cpr / b.cpr - 1) * 100)}% so với TB 7 ngày ${fmt(b.cpr)})` });
  });
  const fresh = new Set(await freshKeys(found));
  const lines = found.filter((f) => fresh.has(f.key)).map((f) => f.text);
  const sent = lines.length ? await notify("🔔 Cảnh báo Quảng cáo", lines) : [];
  return { checked: now.length + gNow.length, alerts: lines, sent, errors: now.filter((a: any) => a.error).map((a: any) => a.name + ": " + a.error) };
}

async function daily() {
  const ACCOUNTS = await loadAccounts();
  const y = addDays(isoOf(vnNow()), -1);
  const [day, week] = await Promise.all([
    Promise.all(ACCOUNTS.map((a) => fetchAccount(a, y, y, null, true))),
    Promise.all(ACCOUNTS.map((a) => fetchAccount(a, addDays(y, -6), y, null, true))),
  ]);
  const gDay = await gadsReport(y, y, null, true);
  const [dd, mm] = [y.slice(8, 10), y.slice(5, 7)];
  const lines: string[] = [];
  for (const group of ["conv", "brand"]) {
    lines.push(group === "conv" ? "🎯 CHUYỂN ĐỔI" : "📣 THƯƠNG HIỆU");
    for (const g of gDay) if (g.group === group) {
      const t = g.totals;
      lines.push(`• ${g.name} (Google): ${fmt(t.spend)} · ${Math.round(t.results * 10) / 10} CĐ · ${t.cpr ? fmt(t.cpr) + "/CĐ" : "—"} · CPC ${fmt(t.cpc)}`);
    }
    day.forEach((a: any, i: number) => {
      if (a.group !== group) return;
      if (a.error) { lines.push(`• ${a.name}: lỗi — ${a.error}`); return; }
      const t = a.totals;
      if (group === "conv") lines.push(`• ${a.name}: ${fmt(t.spend)} · ${t.results} KQ · ${t.cpr ? fmt(t.cpr) + "/KQ" : "—"} · CPM ${fmt(t.cpm)}`);
      else {
        const w: any = week[i];
        const f = w && !w.error ? w.totals.frequency : 0;
        lines.push(`• ${a.name}: ${fmt(t.spend)} · tiếp cận ${t.reach.toLocaleString("vi-VN")} · CPM ${fmt(t.cpm)} · tần suất 7N ${f.toFixed(2)}${f > 3 ? " ⚠️" : ""}`);
      }
    });
    lines.push("");
  }
  const sent = await notify(`📊 Quảng cáo ngày ${dd}/${mm}`, lines);
  return { date: y, sent };
}

// ================= GOOGLE ADS =================
// Google Ads Script (supabase/gads-script.js) đặt ở MCC 2BKIN + tài khoản lẻ VUADONGGOI, chạy MỖI GIỜ,
// đẩy số liệu chiến dịch/từ khoá theo ngày về đây (mode gads_ingest, header x-ingest-key) → bảng qws_gads_*.
const G_KNOWN: Record<string, { name: string; grp: string; active?: boolean }> = {
  "2705036143": { name: "Vạn Thiên Ý", grp: "conv" },
  "2314718894": { name: "Nhậu Phi Trường · Google", grp: "conv" },
  "3874613096": { name: "XKLD A Thanh", grp: "conv" },
  "9181366094": { name: "Vua Đóng Gói · Google", grp: "conv" },
  "4056318580": { name: "FPT-HPG", grp: "conv", active: false },
};
const cidOf = (v: unknown) => String(v || "").replace(/\D/g, "");
async function kvGet(k: string) {
  const { data } = await admin().from("qws_ads_kv").select("v").eq("k", k).maybeSingle();
  return data?.v || null;
}
async function kvSet(k: string, v: string) {
  const { error } = await admin().from("qws_ads_kv").upsert({ k, v, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
async function selectAll(build: () => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function upsertChunks(table: string, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin().from(table).upsert(rows.slice(i, i + 500));
    if (error) throw new Error(table + ": " + error.message);
  }
}

async function gadsIngest(body: any) {
  const a = body.account || {};
  const cid = cidOf(a.cid);
  if (!cid) throw new Error("Thiếu customer id");
  const supa = admin();
  const { data: ex } = await supa.from("qws_gads_accounts").select("customer_id").eq("customer_id", cid).maybeSingle();
  const info = {
    name_meta: String(a.name || cid).slice(0, 120), currency: a.currency || "VND", policy_issues: Number(a.policyIssues) || 0, last_sync: new Date().toISOString(),
    status: a.status || null,
    budget_remaining: a.budget && a.budget.remaining != null ? num(a.budget.remaining) : null,
    budget_limit: a.budget && a.budget.limit != null ? num(a.budget.limit) : null,
    conv_actions: Array.isArray(body.actions) ? body.actions.slice(0, 100) : null,
  };
  if (ex) {
    const { error } = await supa.from("qws_gads_accounts").update(info).eq("customer_id", cid);
    if (error) throw new Error(error.message);
  } else {
    const k = G_KNOWN[cid];
    const { error } = await supa.from("qws_gads_accounts").insert({ customer_id: cid, name: k?.name || info.name_meta, grp: k?.grp || "conv", active: k?.active ?? true, ...info });
    if (error) throw new Error(error.message);
  }
  const camps = (body.campaigns || []).map((c: any) => ({
    customer_id: cid, date: c.date, campaign_id: String(c.id), campaign_name: c.name, campaign_status: c.status, channel: c.channel,
    cost: num(c.cost), impressions: num(c.imp), clicks: num(c.clicks), conversions: num(c.conv), conv_value: num(c.value),
    search_is: c.sis == null ? null : num(c.sis), budget_lost_is: c.blis == null ? null : num(c.blis), updated_at: new Date().toISOString(),
  }));
  const kws = (body.keywords || []).map((k: any) => ({
    customer_id: cid, date: k.date, ad_group_id: String(k.ag), criterion_id: String(k.id), keyword: k.text, match_type: k.match, campaign_name: k.campaign,
    cost: num(k.cost), impressions: num(k.imp), clicks: num(k.clicks), conversions: num(k.conv),
  }));
  // chuyển đổi theo TỪNG LOẠI (hành động chuyển đổi đã cài trong Google Ads)
  const convs = (body.convs || []).map((c: any) => ({
    customer_id: cid, date: c.date, campaign_id: String(c.id), action_name: String(c.action || "?").slice(0, 200), category: c.cat || null,
    conversions: num(c.conv), conv_value: num(c.value), all_conversions: num(c.all),
  }));
  await upsertChunks("qws_gads_daily", camps);
  await upsertChunks("qws_gads_kw_daily", kws);
  await upsertChunks("qws_gads_conv_daily", convs);
  return { ok: true, cid, campaigns: camps.length, keywords: kws.length, convs: convs.length };
}

// Gộp dòng ngày → chỉ số cùng "hình dạng" với Meta (results = chuyển đổi, cpr = CPA)
function gMetrics(rows: any[]) {
  let spend = 0, impressions = 0, clicks = 0, conv = 0, value = 0, sisW = 0, sisImp = 0, blW = 0, blImp = 0;
  for (const r of rows) {
    const imp = num(r.impressions);
    spend += num(r.cost); impressions += imp; clicks += num(r.clicks); conv += num(r.conversions); value += num(r.conv_value);
    if (r.search_is != null) { sisW += num(r.search_is) * imp; sisImp += imp; }
    if (r.budget_lost_is != null) { blW += num(r.budget_lost_is) * imp; blImp += imp; }
  }
  return {
    spend, impressions, clicks, results: conv, convValue: value,
    cpr: conv > 0 ? spend / conv : null, roas: spend > 0 && value > 0 ? value / spend : null,
    ctr: impressions ? (clicks / impressions) * 100 : 0, cpc: clicks ? spend / clicks : 0, cpm: impressions ? (spend / impressions) * 1000 : 0,
    searchIS: sisImp ? (sisW / sisImp) * 100 : null, budgetLostIS: blImp ? (blW / blImp) * 100 : null,
  };
}
function groupBy(rows: any[], key: (r: any) => string) {
  const g: Record<string, any[]> = {};
  for (const r of rows) (g[key(r)] = g[key(r)] || []).push(r);
  return g;
}
async function gadsReport(since: string, until: string, prev: { since: string; until: string } | null, light = false) {
  const accs = await selectAll(() => admin().from("qws_gads_accounts").select("*").eq("active", true).order("sort").order("created_at"));
  if (!accs.length) return [];
  const ids = accs.map((a: any) => a.customer_id);
  const from = prev ? prev.since : since;
  const rows = await selectAll(() => admin().from("qws_gads_daily").select("*").in("customer_id", ids).gte("date", from).lte("date", until));
  const kws = light ? [] : await selectAll(() => admin().from("qws_gads_kw_daily").select("*").in("customer_id", ids).gte("date", since).lte("date", until));
  const convs = light ? [] : await selectAll(() => admin().from("qws_gads_conv_daily").select("*").in("customer_id", ids).gte("date", since).lte("date", until));
  // Số dư: account budget (nếu có) hoặc sổ nạp tiền; TB chi 7 ngày đủ (không tính hôm nay)
  const today = isoOf(vnNow());
  const led = await ledgers(ids.map((c: string) => "g" + c));
  const anchorDates = Object.values(led).flat().filter((r: any) => r.kind === "anchor").map((r: any) => vnDateOf(r.at));
  const balFrom = [addDays(today, -7), ...anchorDates].sort()[0];
  const costRows = await selectAll(() => admin().from("qws_gads_daily").select("customer_id,date,cost").in("customer_id", ids).gte("date", balFrom));
  const balOf = (a: any) => {
    const mine = costRows.filter((r: any) => r.customer_id === a.customer_id);
    const sumFrom = (d: string, to = "9999") => mine.filter((r: any) => r.date >= d && r.date <= to).reduce((x: number, r: any) => x + num(r.cost), 0);
    const avg7 = sumFrom(addDays(today, -7), addDays(today, -1)) / 7;
    if (a.budget_remaining != null) return withDays({ balance: num(a.budget_remaining), limit: a.budget_limit, source: "google_budget" }, avg7);
    return withDays(fromLedger(led["g" + a.customer_id], (d) => sumFrom(d)), avg7);
  };
  return accs.map((a: any) => {
    const mine = rows.filter((r: any) => r.customer_id === a.customer_id);
    const cur = mine.filter((r: any) => r.date >= since && r.date <= until);
    const pr = prev ? mine.filter((r: any) => r.date >= prev.since && r.date <= prev.until) : null;
    const base = {
      id: "g" + a.customer_id, cid: a.customer_id, platform: "google", name: a.name, group: a.grp, currency: a.currency,
      lastSync: a.last_sync, status: a.status, issues: a.policy_issues ? [{ name: a.policy_issues + " quảng cáo bị từ chối / hạn chế chính sách", status: "POLICY" }] : [],
      totals: gMetrics(cur), prev: pr ? gMetrics(pr) : null, bal: balOf(a),
    };
    if (light) return base;
    const daily = Object.entries(groupBy(cur, (r) => r.date)).map(([date, l]) => ({ date, ...gMetrics(l) })).sort((x, y) => x.date.localeCompare(y.date));
    const campaigns = Object.entries(groupBy(cur, (r) => r.campaign_id)).map(([id, l]) => ({ id, name: l[0].campaign_name, status: l[l.length - 1].campaign_status, ...gMetrics(l) })).sort((x: any, y: any) => y.spend - x.spend);
    const keywords = Object.entries(groupBy(kws.filter((k: any) => k.customer_id === a.customer_id), (k) => k.ad_group_id + "|" + k.criterion_id))
      .map(([id, l]) => ({ id, name: l[0].keyword, match: l[0].match_type, campaign: l[0].campaign_name, ...gMetrics(l) }))
      .sort((x: any, y: any) => y.spend - x.spend).slice(0, 60);
    // Chuyển đổi theo loại: gộp theo tên hành động; kèm các hành động đã cài nhưng chưa phát sinh trong kỳ
    const spend = base.totals.spend;
    const byAction: Record<string, any> = {};
    for (const c of convs.filter((x: any) => x.customer_id === a.customer_id)) {
      const o = (byAction[c.action_name] = byAction[c.action_name] || { name: c.action_name, category: c.category, conversions: 0, allConversions: 0, value: 0 });
      o.conversions += num(c.conversions); o.allConversions += num(c.all_conversions); o.value += num(c.conv_value);
    }
    for (const ca of a.conv_actions || []) {
      const o = (byAction[ca.name] = byAction[ca.name] || { name: ca.name, category: ca.category, conversions: 0, allConversions: 0, value: 0 });
      o.primary = !!ca.primary; o.counted = ca.counted !== false;
    }
    const convActions = Object.values(byAction).map((o: any) => ({ ...o, cpa: o.conversions > 0 ? spend / o.conversions : null }))
      .sort((x: any, y: any) => y.allConversions - x.allConversions);
    return { ...base, daily, campaigns, keywords, convActions };
  });
}

// ---------- Entry ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "report";

  if (mode === "watch" || mode === "daily") {
    // Khoá cron nằm trong Supabase Vault — so khớp qua RPC (chỉ service role gọi được), không cần secret riêng
    const { data: ok } = await admin().rpc("qws_ads_check_cron_key", { k: req.headers.get("x-cron-key") || "" });
    if (ok !== true) return json({ error: "Sai cron key" }, 401);
    try { return json(mode === "watch" ? await watch() : await daily()); }
    catch (e) { return json({ error: String(e) }, 500); }
  }

  if (mode === "gads_ingest" || mode === "gads_status") {
    // Google Ads Script → xác thực bằng khoá ingest (chủ tạo trong Cài đặt, gắn sẵn vào script)
    const key = await kvGet("gads_ingest_key");
    if (!key || req.headers.get("x-ingest-key") !== key) return json({ error: "Sai ingest key" }, 401);
    try {
      if (mode === "gads_ingest") return json(await gadsIngest(body));
      // ngày sớm nhất đã có của từng tài khoản → script quyết định có cần nạp lùi 120 ngày không
      const { data } = await admin().rpc("qws_gads_earliest");
      const earliest: Record<string, string> = {};
      for (const r of data || []) earliest[r.customer_id] = r.earliest;
      return json({ earliest });
    } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
  }

  // Các chế độ còn lại — chỉ chủ workspace
  const OWNER = (Deno.env.get("OWNER_EMAIL") || "").toLowerCase();
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await supa.auth.getUser();
  const email = ((u && u.user && u.user.email) || "").toLowerCase();
  if (!email) return json({ error: "Chưa đăng nhập" }, 401);
  if (!OWNER || email !== OWNER) {
    // Thành viên được chủ cấp quyền "Quảng cáo" (Xem/Sửa trong Cài đặt → Người dùng) → CHỈ các chế độ ĐỌC số liệu
    const READ_MODES = ["report", "alerts_list", "balance_list"];
    const { data: rows } = await admin().from("qws_workspaces").select("members:data->members");
    const mem = (rows || []).flatMap((r: any) => (Array.isArray(r.members) ? r.members : [])).find((m: any) => String(m?.email || "").toLowerCase() === email);
    const acc = mem ? (mem.access?.ads ?? ((mem.perms || []).includes("ads") ? "edit" : "none")) : "none";
    if (acc === "none" || !READ_MODES.includes(mode)) return json({ error: "Chỉ chủ workspace (hoặc thành viên được cấp quyền Quảng cáo — chỉ xem số liệu) dùng được" }, 403);
  }

  try {
    if (mode === "config_list") return json({ accounts: (await loadAccounts(true)).map(safe) });

    if (mode === "config_discover") {
      // Token → danh sách TKQC mà token đó đọc được (để tick chọn)
      const token = String(body.token || "").trim();
      if (!token) return json({ error: "Thiếu token" }, 400);
      const list = await gall("me/adaccounts", { fields: "account_id,name,currency,account_status", limit: "100" }, token, 3);
      const have = new Set((await loadAccounts(true)).map((a: any) => a.id));
      return json({
        accounts: list.map((a: any) => {
          const k = KNOWN[a.account_id];
          return { id: a.account_id, metaName: a.name, currency: a.currency, status: a.account_status,
            name: k?.name || a.name, brand: k?.brand || "", group: k?.grp || "conv", services: !!k?.services, added: have.has(a.account_id) };
        }),
      });
    }

    if (mode === "config_save") {
      // Thêm/cập nhật nhiều TKQC dùng chung 1 token (1 BM)
      const token = String(body.token || "").trim();
      const accs = Array.isArray(body.accounts) ? body.accounts : [];
      if (!token || !accs.length) return json({ error: "Thiếu token hoặc chưa chọn tài khoản" }, 400);
      const rows = accs.map((a: any, i: number) => ({
        id: String(a.id).replace(/^act_/, ""), name: String(a.name || a.id).slice(0, 80), brand: String(a.brand || "").slice(0, 80),
        grp: a.group === "brand" ? "brand" : "conv", services: !!a.services, token, active: true, sort: Number(a.sort) || i,
      }));
      const { error } = await admin().from(TABLE).upsert(rows);
      if (error) throw new Error(error.message);
      return json({ ok: true, saved: rows.length });
    }

    if (mode === "config_update") {
      // Sửa tên/nhóm/bật-tắt/thứ tự; token chỉ đổi khi gửi kèm token mới
      const id = String(body.id || "");
      const p = body.patch || {};
      const patch: any = {};
      if (p.name != null) patch.name = String(p.name).slice(0, 80);
      if (p.brand != null) patch.brand = String(p.brand).slice(0, 80);
      if (p.group != null) patch.grp = p.group === "brand" ? "brand" : "conv";
      if (p.services != null) patch.services = !!p.services;
      if (p.active != null) patch.active = !!p.active;
      if (p.sort != null) patch.sort = Number(p.sort) || 0;
      if (p.token) patch.token = String(p.token).trim();
      const { error } = await admin().from(TABLE).update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (mode === "config_delete") {
      const { error } = await admin().from(TABLE).delete().eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (mode === "gads_key") {
      // Khoá cho Google Ads Script — tạo 1 lần (rotate = tạo lại, script cũ phải dán lại)
      let key = await kvGet("gads_ingest_key");
      if (!key || body.rotate) { key = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""); await kvSet("gads_ingest_key", key); }
      return json({ key });
    }
    if (mode === "gads_list") {
      const accs = await selectAll(() => admin().from("qws_gads_accounts").select("customer_id,name,name_meta,grp,active,policy_issues,last_sync,currency").order("sort").order("created_at"));
      return json({ accounts: accs });
    }
    if (mode === "gads_update") {
      const p = body.patch || {}, patch: any = {};
      if (p.name != null) patch.name = String(p.name).slice(0, 80);
      if (p.group != null) patch.grp = p.group === "brand" ? "brand" : "conv";
      if (p.active != null) patch.active = !!p.active;
      const { error } = await admin().from("qws_gads_accounts").update(patch).eq("customer_id", cidOf(body.cid));
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }
    if (mode === "gads_delete") {
      const cid = cidOf(body.cid);
      for (const t of ["qws_gads_kw_daily", "qws_gads_daily", "qws_gads_accounts"]) {
        const { error } = await admin().from(t).delete().eq("customer_id", cid);
        if (error) throw new Error(error.message);
      }
      return json({ ok: true });
    }

    if (mode === "balance_list") {
      const { data } = await admin().from("qws_ads_balance").select("*").eq("account_id", String(body.accountId || "")).order("at", { ascending: false }).limit(50);
      return json({ rows: data || [] });
    }
    if (mode === "balance_add") {
      // kind: "anchor" = số dư hiện tại đang thấy trên Google/Meta · "topup" = vừa nạp thêm
      const accountId = String(body.accountId || ""), kind = body.kind === "topup" ? "topup" : "anchor", amount = num(body.amount);
      if (!accountId || !(amount > 0 || (kind === "anchor" && amount === 0))) return json({ error: "Thiếu tài khoản hoặc số tiền" }, 400);
      let cost_at = 0;
      if (kind === "anchor") {
        // chi phí HÔM NAY đã ghi nhận lúc nhập → không trừ trùng
        const today = isoOf(vnNow());
        if (accountId.startsWith("g")) {
          const { data } = await admin().from("qws_gads_daily").select("cost").eq("customer_id", accountId.slice(1)).eq("date", today);
          cost_at = (data || []).reduce((a: number, r: any) => a + num(r.cost), 0);
        } else {
          const acc = (await loadAccounts(true)).find((a: any) => a.id === accountId);
          if (acc?.token) cost_at = num((await gall("act_" + acc.id + "/insights", { level: "account", fields: "spend", date_preset: "today" }, acc.token, 1))[0]?.spend);
        }
      }
      const { error } = await admin().from("qws_ads_balance").insert({ account_id: accountId, kind, amount, cost_at, note: String(body.note || "").slice(0, 200) });
      if (error) throw new Error(error.message);
      return json({ ok: true, cost_at });
    }
    if (mode === "balance_delete") {
      const { error } = await admin().from("qws_ads_balance").delete().eq("id", Number(body.id));
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }
    if (mode === "alerts_list") {
      const { data } = await admin().from("qws_ads_alerts").select("key,text,account_id,sent_at").gte("sent_at", new Date(Date.now() - 2 * 86400000).toISOString()).order("sent_at", { ascending: false }).limit(50);
      return json({ alerts: (data || []).filter((r: any) => r.text) });
    }

    // report
    const ACCOUNTS = await loadAccounts();
    const today = isoOf(vnNow());
    const since = /^\d{4}-\d{2}-\d{2}$/.test(body.since || "") ? body.since : today;
    const until = /^\d{4}-\d{2}-\d{2}$/.test(body.until || "") ? body.until : since;
    const isToday = since === today && until === today;
    // Kỳ trước = cùng độ dài, ngay trước kỳ đang xem
    let prev = null;
    if (body.compare) {
      const days = Math.round((Date.parse(until) - Date.parse(since)) / 86400000) + 1;
      prev = { since: addDays(since, -days), until: addDays(since, -1) };
    }
    const [meta, google] = await Promise.all([
      Promise.all(ACCOUNTS.map((a: any) => fetchAccount(a, isToday ? "today" : since, isToday ? "today" : until, prev))),
      gadsReport(since, until, prev).catch((e) => [{ id: "g-error", platform: "google", name: "Google Ads", group: "conv", error: String((e as Error).message || e) }]),
    ]);
    const mLed = await ledgers(ACCOUNTS.map((a: any) => a.id));
    const mBal = await Promise.all(ACCOUNTS.map((a: any) => (mLed[a.id] ? metaBalance(a, mLed[a.id]).catch(() => null) : null)));
    return json({ since, until, prev, accounts: [...meta.map((a: any, i: number) => ({ ...a, platform: "meta", bal: mBal[i] })), ...google], updatedAt: Date.now() });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
