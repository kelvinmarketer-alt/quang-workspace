/* Quang Workspace — Service Worker: Web Push nền + mở app khi MẤT MẠNG */
const CACHE = "qws-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Trang (HTML): LẤY MẠNG TRƯỚC (luôn bản mới nhất sau mỗi lần deploy), mất mạng → bản đã lưu.
// File /assets/* (tên có mã băm, không đổi nội dung): lấy bộ nhớ trước. Không đụng tới API / Supabase / Binance.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const c = await caches.open(CACHE); c.put("/", res.clone()); }
        return res;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
        const keys = await c.keys(); // giữ gọn: tối đa ~250 file, xoá file cũ nhất
        if (keys.length > 250) for (const k of keys.slice(0, keys.length - 250)) await c.delete(k);
      }
      return res;
    })());
  }
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const title = d.title || "Quang Workspace";
  const options = {
    body: d.body || "",
    icon: "/logo-mark.png",
    badge: "/logo-mark.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  // Link sang trang khác (vd Văn phòng AI office.2bkin.io.vn) → mở cửa sổ mới, không đè app
  const target = new URL(url, self.location.origin);
  if (target.origin !== self.location.origin) { event.waitUntil(self.clients.openWindow(target.href)); return; }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { try { c.navigate(url); } catch {} return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
