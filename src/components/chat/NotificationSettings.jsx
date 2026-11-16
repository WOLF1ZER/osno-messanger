import { useEffect, useState } from "react";
import { FiBell, FiLoader } from "react-icons/fi";
import Toggle from "../ui/Toggle";
import { disablePush, enablePush, getPushState } from "../../lib/push";

const HINT = {
  enabled: "On for this device — messages and calls, even when OSNO is closed.",
  disabled: "Get messages and incoming calls when OSNO is closed.",
  denied: "Blocked by your browser. Allow notifications for this site in its settings, then reload.",
  "needs-install": "On iPhone and iPad, install OSNO to your Home Screen first (see Install app below).",
  unsupported: "This browser doesn't support push notifications.",
  "not-configured": "Push isn't set up yet (VITE_VAPID_PUBLIC_KEY missing).",
};

/** Push notifications on/off for this device. */
const NotificationSettings = () => {
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  const toggle = async (on) => {
    setBusy(true);
    setError("");
    try {
      if (on) await enablePush();
      else await disablePush();
    } catch (e) {
      setError(e.message);
    } finally {
      setState(await getPushState().catch(() => "unsupported"));
      setBusy(false);
    }
  };

  const canToggle = state === "enabled" || state === "disabled";

  return (
    <div className="glass px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-4 min-w-0">
          <FiBell size={18} className="text-ink-300 shrink-0" />
          <span className="min-w-0">
            <span className="label text-ink-100 block">Notifications</span>
            <span className="text-[11px] text-ink-400 block">{state === "loading" ? "Checking…" : HINT[state]}</span>
          </span>
        </span>
        {busy ? (
          <FiLoader className="animate-spin text-ink-300 shrink-0" />
        ) : (
          canToggle && <Toggle checked={state === "enabled"} onChange={toggle} label="Push notifications" />
        )}
      </div>
      {error && <p className="mt-3 text-sm text-white border-l-2 border-white pl-3">{error}</p>}
    </div>
  );
};

export default NotificationSettings;
