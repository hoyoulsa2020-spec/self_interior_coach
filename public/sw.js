/* PWA Service Worker - Push Notifications */
self.addEventListener("push", function (event) {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "셀인코치", body: event.data.text() || "새 알림이 있습니다." };
  }
  const { title = "셀인코치", body = "", icon = "/icon-192.png", url = "/", tag = "selco-notification" } = data;
  const options = {
    body,
    icon,
    badge: icon,
    tag,
    data: { url },
    requireInteraction: false,
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      const existing = clientList.find((c) => c.url.includes(self.location.origin) && "focus" in c);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
