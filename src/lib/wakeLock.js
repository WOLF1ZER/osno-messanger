// Keeps the screen on (no dimming / auto-lock) while `active` — used during calls.
// Uses the Screen Wake Lock API (Chrome, Edge, Android, Safari 16.4+). Browsers without it get a
// fallback: a tiny muted, inline video playing in a loop, which also keeps phones awake.
import { useEffect } from "react";

const startVideoFallback = () => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream?.(1);
    if (!stream) return () => {};
    let on = false;
    const tick = setInterval(() => {
      on = !on;
      ctx.fillStyle = on ? "#000" : "#010101";
      ctx.fillRect(0, 0, 2, 2);
    }, 1000);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
    video.srcObject = stream;
    document.body.appendChild(video);
    video.play().catch(() => {});
    return () => {
      clearInterval(tick);
      video.pause();
      video.remove();
      stream.getTracks().forEach((t) => t.stop());
    };
  } catch {
    return () => {};
  }
};

export const useWakeLock = (active) => {
  useEffect(() => {
    if (!active) return;
    let lock = null;
    let stopFallback = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if ("wakeLock" in navigator) {
        try {
          lock = await navigator.wakeLock.request("screen");
          return;
        } catch {
          /* not allowed right now (e.g. low battery mode) -> fallback */
        }
      }
      if (!stopFallback) stopFallback = startVideoFallback();
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
