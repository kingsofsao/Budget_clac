"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds only (keeps dev hot-reload predictable). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installability is a progressive enhancement; the app works without it.
    });
  }, []);
  return null;
}

/** Remove cached pages (called on sign-out so trip data does not linger on shared devices). */
export async function clearOfflineCache() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("tripsplit-pages")).map((k) => caches.delete(k)),
      );
    }
  } catch {
    // ignore
  }
}
