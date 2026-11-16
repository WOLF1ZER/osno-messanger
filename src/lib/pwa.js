// Service worker registration, "new version" prompt and the install (A2HS) prompt.
import { useEffect, useState, useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

// ---------- updates ----------
let updateSW = null;
let needRefresh = false;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const initPWA = () => {
  if (!("serviceWorker" in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      emit();
    },
    onRegisteredSW(_url, reg) {
      // look for a new version every hour while the app is open
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
};

export const useUpdateAvailable = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => needRefresh,
  );

export const applyUpdate = () => updateSW?.(true);
export const dismissUpdate = () => {
  needRefresh = false;
  emit();
};

// ---------- install ----------
let deferredPrompt = null;
const installListeners = new Set();
const emitInstall = () => installListeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button
    deferredPrompt = e;
    emitInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitInstall();
  });
}

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * state: "installed" | "available" (one-click install) | "ios" (Share → Add to Home Screen) | "manual" (browser menu)
 */
export const useInstall = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    installListeners.add(l);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", l);
    return () => {
      installListeners.delete(l);
      mq?.removeEventListener?.("change", l);
    };
  }, []);

  const state = isStandalone() ? "installed" : deferredPrompt ? "available" : isIOS() ? "ios" : "manual";

  const install = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    emitInstall();
    return outcome === "accepted";
  };

  return { state, install };
};
