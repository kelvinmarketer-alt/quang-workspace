/* Quang Workspace — Service Worker cho Web Push nền */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
