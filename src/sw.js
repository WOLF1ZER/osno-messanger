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

// ---------- messages from the app ----------
// The app reports every few seconds whether it is really on screen. We only skip showing a
// notification when that report is fresh: iOS sometimes reports a backgrounded app as "visible",
// and it cancels push subscriptions of apps that receive pushes without showing a notification.
let foregroundAt = 0;
let openChatId = null;

self.addEventListener("message", (event) => {
  const msg = event.data ?? {};
  if (msg.type === "SKIP_WAITING") self.skipWaiting(); // "Update" button
  if (msg.type === "foreground") {
    foregroundAt = Date.now();
    openChatId = msg.chatId ?? null;
  }
  if (msg.type === "background") foregroundAt = 0;
  // a chat was opened in the app: remove its notifications from the system tray
  if (msg.type === "chat-opened" && msg.chatId) {
    event.waitUntil(
      self.registration
        .getNotifications({ tag: `chat-${msg.chatId}` })
        .then((list) => list.forEach((n) => n.close())),
    );
  }
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
      const visible = windows.find((w) => w.visibilityState === "visible");
      const appOnScreen = visible && Date.now() - foregroundAt < 15_000;
      const isOpenChat = data.tag && openChatId && data.tag === `chat-${openChatId}`;
      // The app is confirmed on screen and already shows this message / the ringing call itself.
      if (appOnScreen && (data.kind === "call" || isOpenChat)) {
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
