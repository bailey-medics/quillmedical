/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// Take control immediately on install/activate
self.skipWaiting();
clientsClaim();

// Clean old precache entries on version update
cleanupOutdatedCaches();

// Precache all assets from the Vite build manifest (injected by
// vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);

// Compute base path from SW scope for push notification icons
const BASE = new URL(".", self.registration.scope).pathname;

// Handle incoming push notifications
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Notification";
  const options: NotificationOptions = {
    body: data.body || "",
    icon: `${BASE}android-chrome-192x192.png`,
    badge: `${BASE}android-chrome-192x192.png`,
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Open/focus the app when the user clicks a notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || BASE;
  event.waitUntil(self.clients.openWindow(url));
});

// Allow the page to tell this SW to skip waiting (for updates)
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
