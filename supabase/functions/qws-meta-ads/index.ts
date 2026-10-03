// Edge Function: qws-meta-ads — số liệu Meta Ads (Facebook) LIVE cho module "Quảng cáo".
// Đọc trực tiếp Marketing API bằng token System User của TỪNG BM (không cần BM mẹ).
// Danh sách TKQC + token lưu ở bảng qws_ads_accounts (chỉ service role đọc) — chủ thêm/sửa trong app (Cài đặt).
//
// 3 chế độ (body.mode):
//   "report" (mặc định) — app gọi khi mở module: { since, until, compare } → số liệu từng tài khoản.
//                         Chỉ CHỦ workspace (email == OWNER_EMAIL).
//   "watch"  — pg_cron 15 phút/lần: soát số HÔM NAY → cảnh báo (Web Push + Telegram nếu có).
//   "daily"  — pg_cron 6h sáng: tóm tắt HÔM QUA + cảnh báo tần suất.
//   "config_list" / "config_discover" / "config_save" / "config_update" / "config_delete" — quản lý TKQC + token (chỉ CHỦ).
//   watch/daily xác thực bằng header x-cron-key == CRON_KEY.
//
// Secrets: OWNER_EMAIL, CRON_KEY, (tuỳ chọn) TELEGRAM_TOKEN, TELEGRAM_CHAT_ID. SUPABASE_URL/ANON/SERVICE_ROLE Supabase tự cấp.
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
const BASE_FIELDS = "spend,impressions,reach,frequency,cpm,ctr,cpc,clicks,actions,video_thruplay_watched_actions";

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
  };
  const results = m.msgs + m.leads;
  return { ...m, results, cpr: results > 0 ? m.spend / results : null };
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
  const keys = ["spend", "impressions", "clicks", "msgs", "leads", "linkClicks", "engagement", "video3s", "pageLikes", "thruplay"];
  const s: any = {};
  for (const k of keys) s[k] = list.reduce((a, x) => a + (x[k] || 0), 0);
  s.results = s.msgs + s.leads;
  s.cpr = s.results > 0 ? s.spend / s.results : null;
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
  try {
    const [info, tot, daily, camps, ads, bad, prevTot] = await Promise.all([
      gget(act_, { fields: "name,currency,account_status,disable_reason,amount_spent,spend_cap,balance,timezone_name" }, token),
      gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, ...t }, token, 1),
      light ? [] : gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, time_increment: "1", limit: "100", ...t }, token, 4),
      light ? [] : gall(act_ + "/insights", { level: "campaign", fields: "campaign_id,campaign_name," + BASE_FIELDS, limit: "200", ...t }, token, 3),
      light ? [] : gall(act_ + "/insights", { level: "ad", fields: "ad_id,ad_name,campaign_name," + BASE_FIELDS, limit: "200", sort: "spend_descending", ...t }, token, 2),
      gall(act_ + "/ads", { fields: "name,effective_status", effective_status: JSON.stringify(["DISAPPROVED", "WITH_ISSUES"]), limit: "50" }, token, 1).catch(() => []),
      prev ? gall(act_ + "/insights", { level: "account", fields: BASE_FIELDS, ...timeArgs(prev.since, prev.until) }, token, 1) : Promise.resolve(null),
    ]);
    const campaigns = camps.map((c: any) => ({ id: c.campaign_id, name: c.campaign_name, service: acc.services ? mapService(c.campaign_name) : null, ...metrics(c) }))
      .sort((a: any, b: any) => b.spend - a.spend);
    let services = null;
    if (acc.services) {
      const g: Record<string, any[]> = {};
      for (const c of campaigns) (g[c.service] = g[c.service] || []).push(c);
      services = Object.entries(g).map(([name, list]) => ({ name, ...sumMetrics(list) })).sort((a: any, b: any) => b.spend - a.spend);
    }
    return {
      ...base,
      currency: info.currency, status: info.account_status, disableReason: info.disable_reason,
      amountSpent: num(info.amount_spent), spendCap: num(info.spend_cap), balance: num(info.balance), timezone: info.timezone_name,
      totals: metrics(tot[0]),
      prev: prevTot ? metrics(prevTot[0]) : null,
      daily: daily.map((d: any) => ({ date: d.date_start, ...metrics(d) })),
      campaigns, services,
      ads: ads.map((a: any) => ({ id: a.ad_id, name: a.ad_name, campaign: a.campaign_name, ...metrics(a) })),
      issues: (bad || []).map((a: any) => ({ name: a.name, status: a.effective_status })),
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
async function freshKeys(keys: string[]) {
  if (!keys.length) return [];
  const supa = admin();
  const { data } = await supa.from("qws_ads_alerts").select("key").in("key", keys);
  const seen = new Set((data || []).map((r: any) => r.key));
  const fresh = keys.filter((k) => !seen.has(k));
  if (fresh.length) await supa.from("qws_ads_alerts").upsert(fresh.map((key) => ({ key })));
  return fresh;
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
    if (a.group === "conv") {
      if (t.spend >= 100000 && t.results === 0) found.push({ key: k("noresult"), text: `⚠️ ${a.name}: hôm nay tiêu ${fmt(t.spend)} nhưng 0 tin nhắn/lead` });
      const bc = b && !b.error ? b.totals.cpr : null;
      if (bc && t.cpr && t.spend >= 50000 && t.cpr > bc * 1.3)
        found.push({ key: k("cpr"), text: `📈 ${a.name}: giá/kết quả hôm nay ${fmt(t.cpr)} (+${Math.round((t.cpr / bc - 1) * 100)}% so với TB 7 ngày ${fmt(bc)})` });
    } else {
      const bm = b && !b.error ? b.totals.cpm : 0;
      if (bm && t.cpm && t.spend >= 50000 && t.cpm > bm * 1.3)
        found.push({ key: k("cpm"), text: `📈 ${a.name}: CPM hôm nay ${fmt(t.cpm)} (+${Math.round((t.cpm / bm - 1) * 100)}% so với TB 7 ngày ${fmt(bm)})` });
    }
  });
  const fresh = new Set(await freshKeys(found.map((f) => f.key)));
  const lines = found.filter((f) => fresh.has(f.key)).map((f) => f.text);
  const sent = lines.length ? await notify("🔔 Cảnh báo Quảng cáo", lines) : [];
  return { checked: now.length, alerts: lines, sent, errors: now.filter((a: any) => a.error).map((a: any) => a.name + ": " + a.error) };
}

async function daily() {
  const ACCOUNTS = await loadAccounts();
  const y = addDays(isoOf(vnNow()), -1);
  const [day, week] = await Promise.all([
    Promise.all(ACCOUNTS.map((a) => fetchAccount(a, y, y, null, true))),
    Promise.all(ACCOUNTS.map((a) => fetchAccount(a, addDays(y, -6), y, null, true))),
  ]);
  const [dd, mm] = [y.slice(8, 10), y.slice(5, 7)];
  const lines: string[] = [];
  for (const group of ["conv", "brand"]) {
    lines.push(group === "conv" ? "🎯 CHUYỂN ĐỔI" : "📣 THƯƠNG HIỆU");
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

// ---------- Entry ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "report";

  if (mode === "watch" || mode === "daily") {
    const key = Deno.env.get("CRON_KEY");
    if (!key || req.headers.get("x-cron-key") !== key) return json({ error: "Sai cron key" }, 401);
    try { return json(mode === "watch" ? await watch() : await daily()); }
    catch (e) { return json({ error: String(e) }, 500); }
  }

  // Các chế độ còn lại — chỉ chủ workspace
  const OWNER = (Deno.env.get("OWNER_EMAIL") || "").toLowerCase();
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await supa.auth.getUser();
  const email = ((u && u.user && u.user.email) || "").toLowerCase();
  if (!email) return json({ error: "Chưa đăng nhập" }, 401);
  if (!OWNER || email !== OWNER) return json({ error: "Chỉ chủ workspace dùng được module Quảng cáo" }, 403);

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
    const accounts = await Promise.all(ACCOUNTS.map((a: any) => fetchAccount(a, isToday ? "today" : since, isToday ? "today" : until, prev)));
    return json({ since, until, prev, accounts, updatedAt: Date.now() });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
