"use client";
import { useEffect } from "react";

/** Registers the offline app-shell service worker (public/sw.js). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[pwa] sw register failed", e));
    }
  }, []);
  return null;
}
