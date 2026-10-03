// Service worker for SurgeGuard Security Alerts.
//
// Exists only so system notifications can be shown where the browser requires
// a service worker for them (Android Chrome). No caching: alert data must
// always be live, never served from a cache.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      return existing ? existing.focus() : self.clients.openWindow("/");
    }),
  );
});
