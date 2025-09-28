import { useState } from "react";

// Convert URL-safe Base64 VAPID key to Uint8Array for subscribe()
function b64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function EnableNotificationsButton() {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "denied" | "err">(
    "idle",
  );

  async function enable() {
    try {
      // 1) Ask the user
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }

      setState("busy");

      // 2) Wait for the service worker
      const reg = await navigator.serviceWorker.ready;

      // 3) Subscribe with your public VAPID key
      const vapid = import.meta.env.VITE_VAPID_PUBLIC as string;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8Array(vapid),
      });

      // 4) Send subscription to your backend for storage
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("Subscribe API failed");

      setState("ok");
    } catch (e) {
      console.error(e);
      setState("err");
    }
  }

  return (
    <button
      onClick={enable}
      disabled={state === "busy" || state === "ok"}
      style={{
        maxWidth: "150px",
        width: "100%", // make it shrink nicely on small screens
        padding: "0.5rem 1rem", // optional: keep it comfy
      }}
    >
      {state === "ok"
        ? "Notifications enabled"
        : state === "busy"
          ? "Enabling…"
          : state === "denied"
            ? "Permission denied"
            : state === "err"
              ? "Error — try again"
              : "Enable notifications"}
    </button>
  );
}
