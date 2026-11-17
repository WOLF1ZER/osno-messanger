// Keeps the screen on (no dimming / auto-lock) while `active` — used during calls.
//  - Screen Wake Lock API where it works (Chrome, Edge, Android, desktop)
//  - iPhone/iPad: always also play a tiny silent looping video (public/media/keepawake.*),
//    because installed iOS web apps ignore the wake lock before iOS 18.4 while still
//    reporting success. This is the same technique the NoSleep library uses.
import { useEffect } from "react";

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const startVideoKeepAwake = () => {
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("aria-hidden", "true");
  video.style.cssText =
    "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
  for (const [src, type] of [["/media/keepawake.mp4", "video/mp4"], ["/media/keepawake.webm", "video/webm"]]) {
    const source = document.createElement("source");
    source.src = src;
    source.type = type;
    video.appendChild(source);
  }
  document.body.appendChild(video);
  const play = () => video.play().catch(() => {});
  play();
  // iOS pauses it when the app is hidden — start again when it comes back
  const onVisible = () => document.visibilityState === "visible" && play();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    video.pause();
    video.remove();
  };
};

export const useWakeLock = (active) => {
  useEffect(() => {
    if (!active) return;
    let lock = null;
    let stopFallback = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (isIOS() && !stopFallback) stopFallback = startVideoKeepAwake(); // iOS: always
      if ("wakeLock" in navigator) {
        try {
          if (!lock || lock.released) lock = await navigator.wakeLock.request("screen");
          return;
        } catch {
          /* not allowed right now (e.g. low battery mode) -> fallback */
        }
      }
      if (!stopFallback) stopFallback = startVideoKeepAwake();
    };

    acquire();
    // the lock is released automatically when the app goes to the background — take it again on return
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
      stopFallback?.();
    };
  }, [active]);
};
