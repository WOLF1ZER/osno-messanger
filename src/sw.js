/* OSNO service worker: offline app shell + push notifications. */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// ---------- app shell ----------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// every page load serves the cached index.html (single-page app), so the app opens offline
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// Google Fonts
registerRoute(({ url }) => url.origin === "https://fonts.googleapis.com", new StaleWhileRevalidate({ cacheName: "google-fonts-css" }));
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({ cacheName: "google-fonts", plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })] }),
);

// public avatars from Supabase storage
registerRoute(
  ({ url }) => url.pathname.includes("/storage/v1/object/public/avatars/"),
  new CacheFirst({ cacheName: "avatars", plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })] }),
);

// the page asks us to activate a new version ("Update" button)
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ---------- push notifications ----------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "OSNO", body: event.data?.text() ?? "" };
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = windows.find((w) => w.visibilityState === "visible" && w.focused);
      // The app is open and on screen: it already shows the message / ringing UI itself.
      if (visible) {
        visible.postMessage({ type: "push", payload: data });
        return;
      }
      const isCall = data.kind === "call";
      await self.registration.showNotification(data.title || "OSNO", {
        body: data.body || "",
        icon: data.icon || "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag,
        renotify: Boolean(data.tag),
        requireInteraction: isCall,
        vibrate: isCall ? [400, 200, 400, 200, 400] : [120],
        timestamp: Date.now(),
        data: { url: data.url || "/" },
        actions: isCall ? [{ action: "open", title: "Answer" }] : [],
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "open", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
