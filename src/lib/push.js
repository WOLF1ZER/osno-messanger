// Web Push: subscribe this device and store it in Supabase.
import { supabase } from "./supabase";
import { isIOS, isStandalone } from "./pwa";

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "").trim();

const urlBase64ToUint8Array = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/** A VAPID public key is an uncompressed P-256 point: 65 bytes starting with 0x04 (~87 base64url chars, starts with "B"). */
const vapidKeyValid = () => {
  try {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    return bytes.length === 65 && bytes[0] === 4;
  } catch {
    return false;
  }
};

const BAD_KEY =
  "Push isn't set up correctly: VITE_VAPID_PUBLIC_KEY is not a VAPID public key. Generate one with `npx web-push generate-vapid-keys` and use the Public Key.";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * "unsupported" | "needs-install" (iPhone/iPad: install to Home Screen first) | "not-configured"
 * | "denied" | "enabled" | "disabled"
 */
export const getPushState = async () => {
  if (!supported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (!VAPID_PUBLIC_KEY || !vapidKeyValid()) return "not-configured";
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
  if (!VAPID_PUBLIC_KEY) throw new Error("Push isn't configured: add VITE_VAPID_PUBLIC_KEY.");
  if (!vapidKeyValid()) throw new Error(BAD_KEY);
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

const sameKey = (sub) => {
  const key = sub.options?.applicationServerKey;
  if (!key) return true; // browser doesn't tell us — assume it's fine
  const a = new Uint8Array(key);
  const b = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

/**
 * Called on every app start. Keeps this device's push working:
 *  - links the subscription to whoever is signed in now
 *  - re-subscribes if the browser/iOS dropped the subscription or the VAPID key changed
 */
export const refreshPushSubscription = async () => {
  try {
    if (!supported() || Notification.permission !== "granted" || !VAPID_PUBLIC_KEY || !vapidKeyValid()) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub)) {
      await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    }
    await save(sub);
  } catch (e) {
    console.warn("push refresh failed", e);
  }
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
