// Web Push: subscribe this device and store it in Supabase.
import { supabase } from "./supabase";
import { isIOS, isStandalone } from "./pwa";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const urlBase64ToUint8Array = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * "unsupported" | "needs-install" (iPhone/iPad: install to Home Screen first) | "not-configured"
 * | "denied" | "enabled" | "disabled"
 */
export const getPushState = async () => {
  if (!supported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "enabled" : "disabled";
};

const save = async (sub) => {
  const { endpoint, keys } = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
};

/** Ask permission (must be called from a click) and subscribe this device. */
export const enablePush = async () => {
  if (!supported()) throw new Error(isIOS() ? "Install OSNO to your Home Screen first, then enable notifications there." : "This browser doesn't support notifications.");
  if (!VAPID_PUBLIC_KEY) throw new Error("Push isn't configured: add VITE_VAPID_PUBLIC_KEY to .env.local.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings.");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  await save(sub);
};

export const disablePush = async () => {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
};

/** Re-link an existing subscription to whoever is signed in now (e.g. after switching accounts). */
export const refreshPushSubscription = async () => {
  if (!supported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(sub).catch((e) => console.warn("push refresh failed", e));
};

/** On logout: stop this device from receiving the old account's notifications. */
export const forgetPushOnLogout = async () => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
  } catch (e) {
    console.warn(e);
  }
};
