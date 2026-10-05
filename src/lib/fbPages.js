// Module "Hiệu quả Fanpage" — dùng CHUNG kết nối Facebook của Văn phòng AI: office_fb (token System User mỗi BM),
// office_fb_pages (page runner đồng bộ 6h). Token page lấy động từ token hệ thống (không lưu). CHỈ ĐỌC, chỉ chủ (RLS).
// Thêm page mới: gán page vào System User trong Business Manager → Văn phòng AI → Kết nối → Facebook → Làm mới.
import { supabase } from "./supabase.js";

const G = "https://graph.facebook.com/v23.0/";
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const pctChange = (c, p) => (c == null || p == null || !p ? null : ((c - p) / Math.abs(p)) * 100);

// Kỳ: kết thúc hôm qua; FB insights `until` là mốc đầu ngày (không tính) → dùng until = ngày kế tiếp
export function fbRanges(days) {
  const t = iso(new Date()), end = addDays(t, -1);
  return { days, cur: [addDays(end, -(days - 1)), end], prev: [addDays(end, -(2 * days - 1)), addDays(end, -days)] };
}

let sysTokens = null;
const pageTokens = new Map();

async function fbGet(path, params, token) {
  const u = new URL(path.startsWith("http") ? path : G + path);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  if (token) u.searchParams.set("access_token", token);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(j.error.message || "Facebook lỗi");
  return j;
}

export async function listPages() {
  const [{ data: pages, error }, { data: conns, error: e2 }] = await Promise.all([
    supabase.from("office_fb_pages").select("page_id,name,category,fans,fb_id,enabled,updated_at").order("fans", { ascending: false, nullsFirst: false }),
    supabase.from("office_fb").select("id,token,name,updated_at"),
  ]);
  if (error || e2) throw new Error((error || e2).message);
  sysTokens = new Map((conns || []).map((c) => [c.id, c.token]));
  const lastSync = (conns || []).map((c) => c.updated_at).sort().pop() || null;
  // Chỉ page đang BẬT bên Văn phòng AI (tắt ở đó = app cũng không hiện)
  return { pages: (pages || []).filter((p) => p.enabled), lastSync, conns: (conns || []).length, offCount: (pages || []).filter((p) => !p.enabled).length };
}

async function pageToken(p) {
  if (pageTokens.has(p.page_id)) return pageTokens.get(p.page_id);
  if (!sysTokens) await listPages();
  const sys = sysTokens.get(p.fb_id) || [...sysTokens.values()][0];
  if (!sys) throw new Error("Chưa kết nối Facebook bên Văn phòng AI");
  const j = await fbGet(p.page_id, { fields: "access_token" }, sys);
  if (!j.access_token) throw new Error("Token BM không có quyền với page này");
  pageTokens.set(p.page_id, j.access_token);
  return j.access_token;
}

// Chỉ số page còn dùng được (FB đã khai tử page_impressions*, page_fans… từ 2024-2025) — đã test thật 05/10/2026
const PAGE_METRICS = ["page_total_media_view_unique", "page_media_view", "page_post_engagements", "page_daily_follows_unique", "page_daily_unfollows_unique", "page_views_total", "page_video_views", "page_messages_new_conversations_unique", "page_actions_post_reactions_total", "page_follows"];

async function pageInsights(p, [since, until]) {
  const tok = await pageToken(p);
  const j = await fbGet(`${p.page_id}/insights`, { metric: PAGE_METRICS.join(","), period: "day", since, until: addDays(until, 1) }, tok);
  const by = {};
  for (const m of j.data || []) by[m.name] = (m.values || []).map((v) => ({ date: (v.end_time || "").slice(0, 10), value: v.value }));
  const sum = (k) => (by[k] || []).reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);
  const reactions = (by.page_actions_post_reactions_total || []).reduce((s, v) => s + (v.value && typeof v.value === "object" ? Object.values(v.value).reduce((a, b) => a + b, 0) : 0), 0);
  const fl = by.page_follows || [];
  const t = {
    reach: sum("page_total_media_view_unique"), views: sum("page_media_view"), engagement: sum("page_post_engagements"),
    follows: sum("page_daily_follows_unique"), unfollows: sum("page_daily_unfollows_unique"), pageViews: sum("page_views_total"),
    videoViews: sum("page_video_views"), messages: sum("page_messages_new_conversations_unique"), reactions,
    followers: fl.length ? fl[fl.length - 1].value : null,
  };
  t.netFollows = t.follows - t.unfollows;
  t.er = t.reach ? (t.engagement / t.reach) * 100 : null;
  const daily = (by.page_media_view || []).map((v, i) => ({
    date: v.date, views: v.value, reach: by.page_total_media_view_unique?.[i]?.value || 0, engagement: by.page_post_engagements?.[i]?.value || 0,
    messages: by.page_messages_new_conversations_unique?.[i]?.value || 0, follows: by.page_daily_follows_unique?.[i]?.value || 0,
  }));
  return { t, daily };
}

export async function loadPageSummary(p, R) {
  const out = { id: p.page_id, errors: [] };
  try {
    const [cur, prev] = await Promise.all([pageInsights(p, R.cur), pageInsights(p, R.prev)]);
    out.cur = cur.t; out.prev = prev.t; out.daily = cur.daily;
  } catch (e) { out.errors.push(e.message); }
  out.verdict = pageVerdict(out);
  return out;
}

export function pageVerdict(s) {
  if (!s.cur) return { key: "na", label: "Lỗi số liệu", tone: "slate" };
  const dr = pctChange(s.cur.reach, s.prev?.reach), de = pctChange(s.cur.engagement, s.prev?.engagement);
  if (!s.cur.reach && !s.cur.views) return { key: "off", label: "Không hoạt động", tone: "slate" };
  const main = dr ?? 0;
  if (main >= 15 && (de == null || de >= -10)) return { key: "up", label: "Tăng trưởng", tone: "emerald" };
  if (main <= -25 || (de != null && de <= -35)) return { key: "down", label: "Đi xuống", tone: "rose" };
  if (main <= -10) return { key: "warn", label: "Cần chú ý", tone: "amber" };
  return { key: "flat", label: "Ổn định", tone: "sky" };
}

const TYPE_VI = { added_photos: "Ảnh", added_video: "Video", shared_story: "Chia sẻ / link", mobile_status_update: "Trạng thái", created_event: "Sự kiện", published_story: "Bài", created_note: "Ghi chú" };
const val = (ins, name) => { const m = (ins?.data || []).find((x) => x.name === name); const v = m?.values?.[0]?.value; return typeof v === "number" ? v : v && typeof v === "object" ? Object.values(v).reduce((a, b) => a + b, 0) : 0; };

// Bài đăng trong kỳ + chỉ số từng bài; phân tích theo loại bài, giờ đăng, thứ
export async function loadPagePosts(p, R) {
  const tok = await pageToken(p);
  let j = await fbGet(`${p.page_id}/published_posts`, {
    fields: "id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),insights.metric(post_total_media_view_unique,post_media_view,post_clicks,post_video_views)",
    since: R.cur[0], until: addDays(R.cur[1], 1), limit: 100,
  }, tok);
  let rows = j.data || [];
  for (let i = 0; i < 3 && j.paging?.next; i++) { j = await fbGet(j.paging.next); rows = rows.concat(j.data || []); }
  const posts = rows.map((x) => {
    const reach = val(x.insights, "post_total_media_view_unique"), react = x.reactions?.summary?.total_count || 0, cmt = x.comments?.summary?.total_count || 0, share = x.shares?.count || 0;
    const d = new Date(x.created_time);
    return {
      id: x.id, text: (x.message || "").trim(), url: x.permalink_url, img: x.full_picture, type: TYPE_VI[x.status_type] || x.status_type || "Bài",
      at: x.created_time, hour: d.getHours(), dow: d.getDay(),
      reach, views: val(x.insights, "post_media_view"), clicks: val(x.insights, "post_clicks"), videoViews: val(x.insights, "post_video_views"),
      reactions: react, comments: cmt, shares: share, eng: react + cmt + share,
      er: reach ? ((react + cmt + share + val(x.insights, "post_clicks")) / reach) * 100 : null,
    };
  });
  const avg = (l, f) => (l.length ? l.reduce((s, x) => s + (x[f] || 0), 0) / l.length : 0);
  const groupAvg = (keyFn, labelFn) => {
    const m = new Map();
    for (const x of posts) { const k = keyFn(x); m.set(k, [...(m.get(k) || []), x]); }
    return [...m.entries()].map(([k, l]) => ({ key: k, label: labelFn(k), n: l.length, reach: avg(l, "reach"), eng: avg(l, "eng"), clicks: avg(l, "clicks"), er: avg(l, "er") }));
  };
  const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const slot = (h) => (h < 9 ? "Sáng sớm (<9h)" : h < 12 ? "Sáng (9–12h)" : h < 14 ? "Trưa (12–14h)" : h < 18 ? "Chiều (14–18h)" : h < 21 ? "Tối (18–21h)" : "Khuya (≥21h)");
  return {
    posts: posts.sort((a, b) => b.reach - a.reach),
    perWeek: posts.length / (R.days / 7),
    avgReach: avg(posts, "reach"), avgEng: avg(posts, "eng"),
    byType: groupAvg((x) => x.type, (k) => k).sort((a, b) => b.reach - a.reach),
    bySlot: groupAvg((x) => slot(x.hour), (k) => k).sort((a, b) => b.reach - a.reach),
    byDow: groupAvg((x) => x.dow, (k) => DOW[k]).sort((a, b) => a.key - b.key),
  };
}
