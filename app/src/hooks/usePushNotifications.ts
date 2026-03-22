import { useEffect, useRef } from "react";
import { api, hasToken } from "../lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const subscribed = useRef(false);

  useEffect(() => {
    if (subscribed.current) return;
    if (!hasToken()) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    subscribed.current = true;

    (async () => {
      try {
        // Register service worker
        const registration = await navigator.serviceWorker.register("/sw.js");

        // Get VAPID public key
        const { publicKey } = await api.push.vapidKey();

        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });

        // Send subscription to backend
        const sub = subscription.toJSON();
        if (sub.endpoint && sub.keys) {
          await api.push.subscribe({
            endpoint: sub.endpoint,
            keys: sub.keys as { p256dh: string; auth: string },
          });
        }
      } catch (err) {
        console.warn("Push subscription failed:", err);
      }
    })();
  }, []);
}
