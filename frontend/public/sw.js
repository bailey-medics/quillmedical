// Minimal SW for Quill: no caching, instant updates, push-ready.
const SW_VERSION = "v1";

// Compute base path from the SW scope so it works under /app/ (or /)
const BASE = new URL(".", self.registration.scope).pathname;

self.addEventListener("install", () => {
  // Activate as soon as it installs
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of open tabs immediately
  event.waitUntil(self.clients.claim());
});

// Handle incoming push (we'll wire the backend later)
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Notification";
  const options = {
    body: data.body || "",
    icon: `${BASE}android-chrome-192x192.png`,
    badge: `${BASE}android-chrome-192x192.png`,
    data: data.data || {}, // e.g. { url: `${BASE}` }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Open/focus the app when the user clicks a notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || BASE;
  event.waitUntil(self.clients.openWindow(url));
});

// Allow the page to tell this SW to take over immediately (for updates)
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
