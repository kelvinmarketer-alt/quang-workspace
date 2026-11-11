// Module "Hiệu quả Fanpage" — dùng CHUNG kết nối Facebook của Văn phòng AI: office_fb (token System User mỗi BM),
// office_fb_pages (page runner đồng bộ 6h). Token page lấy động từ token hệ thống (không lưu). CHỈ ĐỌC, chỉ chủ (RLS).
// Thêm page mới: gán page vào System User trong Business Manager → Văn phòng AI → Kết nối → Facebook → Làm mới.
import { supabase } from "./supabase.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const pctChange = (c, p) => (c == null || p == null || !p ? null : ((c - p) / Math.abs(p)) * 100);

// Kỳ: kết thúc hôm qua; FB insights `until` là mốc đầu ngày (không tính) → dùng until = ngày kế tiếp
export function fbRanges(period) {
  // period = { since, until } từ bộ lọc chung. Số trang theo ngày Facebook chốt sau nửa đêm → hôm nay thường còn 0.
  const t = iso(new Date());
  const until = period.until > t ? t : period.until, since = period.since > until ? until : period.since;
  const n = Math.round((Date.parse(until) - Date.parse(since)) / 86400000) + 1;
  return { days: n, key: `${since}_${until}`, cur: [since, until], prev: [addDays(since, -n), addDays(since, -1)], hasToday: until === t, partial: since === t };
}

// 01/11: MỌI tài khoản (kể cả chủ) gọi qua edge fn qws-proxy — token BM / token page chỉ nằm ở máy chủ
async function proxy(body) {
  const { data, error } = await supabase.functions.invoke("qws-proxy", { body });
  if (error) { let m = error.message; try { m = (await error.context?.json?.())?.error || m; } catch { /* bỏ qua */ } throw new Error(/Failed to send|not found|404/i.test(m) ? "Máy chủ chưa bật hàm qws-proxy (chủ cần deploy)" : m); }
  if (data?.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Facebook lỗi");
  return data;
}
// GET 1 nhánh số liệu của page qua máy chủ; lỗi tạm thời của Facebook (quá tải, "unexpected error") → đợi rồi thử lại
async function pageGet(p, path, params, tries = 3) {
  try { return await proxy({ action: "fb", page_id: p.page_id, path, params }); }
  catch (e) {
    if (tries > 1 && /unexpected|temporar|try again|limit|quá tải/i.test(e.message || "")) { await new Promise((ok) => setTimeout(ok, 1200 * (4 - tries))); return pageGet(p, path, params, tries - 1); }
    throw e;
  }
}
const pageNext = (p, next) => proxy({ action: "fb", page_id: p.page_id, next });

// Chỉ page đang BẬT bên Văn phòng AI (tắt ở đó = app cũng không hiện). Nhớ 1 lần tải / 5 phút.
let PAGES = null;
export async function listPages(force = false) {
  if (!force && PAGES && PAGES.at > Date.now() - 300000) return PAGES.p;
  const p = proxy({ action: "fb_pages" }).then((d) => ({ pages: d.pages || [], lastSync: d.lastSync || null, conns: d.conns ?? 1, offCount: d.offCount || 0 }));
  PAGES = { at: Date.now(), p };
  p.catch(() => { PAGES = null; });
  return p;
}

// Chỉ số page còn dùng được (FB đã khai tử page_impressions*, page_fans… từ 2024-2025) — đã test thật 05/10/2026
const PAGE_METRICS = ["page_total_media_view_unique", "page_media_view", "page_post_engagements", "page_daily_follows_unique", "page_daily_unfollows_unique", "page_views_total", "page_video_views", "page_messages_new_conversations_unique", "page_actions_post_reactions_total", "page_follows"];

async function pageInsights(p, [since, until]) {
  // Facebook giới hạn ~93 ngày / lần gọi → chia khúc 90 ngày rồi nối lại
  const by = {};
  for (let s = since; s <= until; s = addDays(s, 90)) {
    const e = addDays(s, 89) < until ? addDays(s, 89) : until;
    const j = await pageGet(p, `${p.page_id}/insights`, { metric: PAGE_METRICS.join(","), period: "day", since: s, until: addDays(e, 1) });
    for (const m of j.data || []) by[m.name] = [...(by[m.name] || []), ...(m.values || []).map((v) => ({ date: addDays((v.end_time || "").slice(0, 10), -1), value: v.value })).filter((v) => v.date >= since && v.date <= e)];
  }
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
    out.first = cur.daily.find((x) => (x.views || 0) + (x.reach || 0) > 0)?.date || null; out.last = pageLastDate(cur.daily);
  } catch (e) { out.errors.push(e.message); }
  // Hôm nay: Facebook chưa chốt số ngày → không so sánh, không chấm điểm
  if (R.partial) { if (out.cur) out.prev = {}; out.verdict = { key: "live", label: "Chốt sau 0h", tone: "slate" }; }
  else out.verdict = pageVerdict(out);
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

// ===== SO VỚI KỲ TRƯỚC (11/11) — cùng độ dài liền trước (vd tháng này ↔ cùng số ngày trước đó) =====
// cur/prev: số tổng của page ({ reach, engagement, er, messages… }) · clicks: { cur, prev } cộng từ bài đăng (page không có chỉ số click riêng)
export const COMPARE_ROWS = [["reach", "Tiếp cận"], ["engagement", "Tương tác"], ["clicks", "Click vào bài"], ["er", "Tỉ lệ tương tác", "pt"], ["messages", "Tin nhắn mới"]];
export function comparePeriods(cur = {}, prev = {}, clicks = null) {
  return COMPARE_ROWS.map(([key, label, unit]) => {
    const c = key === "clicks" ? clicks?.cur ?? null : cur?.[key] ?? null;
    const p = key === "clicks" ? clicks?.prev ?? null : prev?.[key] ?? null;
    // Tỉ lệ (%) so bằng điểm phần trăm (5% → 6% = +1 điểm), các số khác so %
    const d = c == null || p == null ? null : unit === "pt" ? c - p : pctChange(c, p);
    return { key, label, cur: c, prev: p, d, unit: unit || "%" };
  });
}
// Tổng click từ danh sách bài (null nếu chưa có bài nào để tính)
export const sumClicks = (posts) => (posts == null ? null : posts.reduce((s, x) => s + (x.clicks || 0), 0));
// Bài kéo tương tác nhất: cảm xúc + bình luận + chia sẻ (hoà thì bài nhiều click hơn lên trước); bỏ bài 0 tương tác
export function topEngaged(posts, n = 5) {
  return [...(posts || [])].filter((x) => (x.eng || 0) > 0).sort((a, b) => (b.eng || 0) - (a.eng || 0) || (b.clicks || 0) - (a.clicks || 0)).slice(0, n);
}
// Ngày mới nhất page có số (Facebook chốt số ngày sau 0h → hôm nay thường chưa có)
export function pageLastDate(daily) {
  let last = null;
  for (const x of daily || []) if ((x.views || 0) + (x.reach || 0) + (x.engagement || 0) > 0 && (!last || x.date > last)) last = x.date;
  return last;
}

const TYPE_VI = { added_photos: "Ảnh", added_video: "Video", shared_story: "Chia sẻ / link", mobile_status_update: "Trạng thái", created_event: "Sự kiện", published_story: "Bài", created_note: "Ghi chú" };
const val = (ins, name) => { const m = (ins?.data || []).find((x) => x.name === name); const v = m?.values?.[0]?.value; return typeof v === "number" ? v : v && typeof v === "object" ? Object.values(v).reduce((a, b) => a + b, 0) : 0; };

// Bài đăng trong kỳ + chỉ số từng bài; phân tích theo loại bài, giờ đăng, thứ
export async function loadPagePosts(p, R) {
  let j = await pageGet(p, `${p.page_id}/published_posts`, {
    fields: "id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),insights.metric(post_total_media_view_unique,post_media_view,post_clicks,post_video_views)",
    since: R.cur[0], until: addDays(R.cur[1], 1), limit: 100,
  });
  let rows = j.data || [];
  for (let i = 0; i < 3 && j.paging?.next; i++) { j = await pageNext(p, j.paging.next); rows = rows.concat(j.data || []); }
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
