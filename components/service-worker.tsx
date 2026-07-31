"use client";

import { useEffect } from "react";

/**
 * Registers the shell-only service worker (§4.5).
 *
 * Production only, deliberately: in dev, Turbopack serves unhashed module URLs
 * that the SW's cache-first rule would happily pin, and you would spend an
 * afternoon debugging a stale chunk. To exercise the SW locally, run
 * `npm run build` then `npm start`.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration must never break the app. The app works
        // online without a service worker; only the offline shell is lost.
      });
    };

    // Registering after load keeps the SW off the critical path of first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
