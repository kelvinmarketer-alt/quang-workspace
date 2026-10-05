// Edge Function: qws-proxy — cho TÀI KHOẢN PHỤ (được chủ cấp quyền "Hiệu quả Website" / "Hiệu quả Fanpage") xem số liệu
// Google Search Console / GA4 / Facebook Page mà KHÔNG lộ khoá: khoá service account (office_google) + token BM (office_fb)
// chỉ đọc ở đây bằng service role. CHỈ ĐỌC: GSC searchAnalytics/query, GA4 runReport, Graph GET của page đang bật.
// Chủ dùng thẳng từ trình duyệt (không qua đây). Không cần secret thêm.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });
const G = "https://graph.facebook.com/v23.0/";

const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function googleToken(keyJson: string) {
  const key = JSON.parse(keyJson);
  const pem = key.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const pk = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: key.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pk, new TextEncoder().encode(unsigned));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google từ chối khoá");
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: u } = await userClient.auth.getUser();
    const email = (u?.user?.email || "").toLowerCase();
    if (!u?.user) return json({ error: "Chưa đăng nhập" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, ...p } = await req.json();
    const feature = String(action || "").startsWith("google") ? "web" : "fanpage";

    // Chủ workspace của người gọi + quyền của họ với tính năng này
    let ownerId: string | null = null;
    const own = await admin.from("qws_workspaces").select("user_id").eq("user_id", u.user.id).maybeSingle();
    if (own.data) ownerId = u.user.id;
    else {
      const { data: rows } = await admin.from("qws_workspaces").select("user_id, members:data->members");
      for (const r of rows || []) {
        const m = (Array.isArray(r.members) ? r.members : []).find((x: { email?: string }) => (x.email || "").toLowerCase() === email);
        if (!m) continue;
        const acc = m.access?.[feature] ?? "none";
        if (acc !== "none") ownerId = r.user_id;
        break;
      }
    }
    if (!ownerId) return json({ error: "Bạn chưa được cấp quyền xem mục này" }, 403);

    if (action === "google_props") {
      const [{ data: props }, { data: conn }] = await Promise.all([
        admin.from("office_google_props").select("kind,prop_id,name,extra,enabled,updated_at").eq("owner_id", ownerId).eq("enabled", true),
        admin.from("office_google").select("sa_email,last_sync_at,last_error").eq("owner_id", ownerId).maybeSingle(),
      ]);
      return json({ props: props || [], conn });
    }
    if (action === "google") {
      const url = String(p.url || "");
      const m1 = url.match(/^https:\/\/searchconsole\.googleapis\.com\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/);
      const m2 = url.match(/^https:\/\/analyticsdata\.googleapis\.com\/v1beta\/properties\/(\d+):runReport$/);
      if (!m1 && !m2) return json({ error: "Không cho phép" }, 400);
      const kind = m1 ? "gsc" : "ga4", id = m1 ? decodeURIComponent(m1[1]) : m2![1];
      const { data: ok } = await admin.from("office_google_props").select("prop_id").eq("owner_id", ownerId).eq("kind", kind).eq("prop_id", id).eq("enabled", true).maybeSingle();
      if (!ok) return json({ error: "Web/property này đang tắt bên Văn phòng AI" }, 403);
      const { data: g } = await admin.from("office_google").select("key_json").eq("owner_id", ownerId).maybeSingle();
      if (!g?.key_json) return json({ error: "Chưa kết nối Google" }, 400);
      const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${await googleToken(g.key_json)}`, "content-type": "application/json" }, body: JSON.stringify(p.body || {}) });
      return json(await r.json(), r.ok ? 200 : r.status);
    }
    if (action === "fb_pages") {
      const { data } = await admin.from("office_fb_pages").select("page_id,name,category,fans,fb_id,enabled,updated_at").eq("owner_id", ownerId).eq("enabled", true).order("fans", { ascending: false });
      return json({ pages: data || [] });
    }
    if (action === "fb") {
      const pageId = String(p.page_id || "");
      const { data: pg } = await admin.from("office_fb_pages").select("page_id,fb_id").eq("owner_id", ownerId).eq("page_id", pageId).eq("enabled", true).maybeSingle();
      if (!pg) return json({ error: "Page này đang tắt bên Văn phòng AI" }, 403);
      const { data: c } = await admin.from("office_fb").select("token").eq("id", pg.fb_id).maybeSingle();
      if (!c?.token) return json({ error: "Chưa kết nối Facebook" }, 400);
      const pt = await (await fetch(`${G}${pageId}?fields=access_token&access_token=${encodeURIComponent(c.token)}`)).json();
      if (!pt.access_token) return json({ error: pt.error?.message || "Token BM không có quyền với page" }, 400);
      // path: "<page_id>/insights" | "<page_id>/published_posts" | next (URL phân trang của chính page đó) — CHỈ GET
      let u2: URL;
      if (p.next) { u2 = new URL(String(p.next)); if (u2.host !== "graph.facebook.com") return json({ error: "Không cho phép" }, 400); }
      else u2 = new URL(G + String(p.path || ""));
      const path = u2.pathname.replace(/^\/v\d+\.\d+\//, "");
      if (!(path === pageId || path.startsWith(pageId + "/"))) return json({ error: "Không cho phép" }, 400);
      for (const [k, v] of Object.entries(p.params || {})) u2.searchParams.set(k, String(v));
      u2.searchParams.set("access_token", pt.access_token);
      const j = await (await fetch(u2)).json();
      if (j?.paging?.next) j.paging.next = j.paging.next.replace(/access_token=[^&]+&?/, ""); // không trả token về trình duyệt
      return json(j);
    }
    return json({ error: "Hành động không hợp lệ" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
