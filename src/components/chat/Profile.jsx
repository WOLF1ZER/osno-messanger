import { useEffect, useId, useRef, useState } from "react";
import {
  FiEye, FiEyeOff, FiUser, FiShield, FiCheck, FiLogOut, FiCamera, FiTrash2, FiX, FiLoader,
} from "react-icons/fi";
import Avatar from "../ui/Avatar";
import Accordion from "../ui/Accordion";
import PanelHeader from "../ui/PanelHeader";
import DisplayName from "../ui/DisplayName";
import InstallApp from "../ui/InstallApp";
import NotificationSettings from "./NotificationSettings";
import { isUsernameAvailable, USERNAME_RE } from "../../lib/api";

const maskEmail = (email = "") => {
  const [name = "", domain = ""] = email.split("@");
  return `${name[0] ?? ""}${"•".repeat(Math.max(name.length - 1, 3))}@${domain}`;
};

const stripAt = (u = "") => u.replace(/^@/, "");

/** Live availability check for a username (debounced). */
const useUsernameStatus = (value, current) => {
  const [status, setStatus] = useState("same"); // same | invalid | checking | available | taken | error
  useEffect(() => {
    const v = value.trim().toLowerCase();
    if (v === current) return setStatus("same");
    if (!USERNAME_RE.test(v)) return setStatus("invalid");
    setStatus("checking");
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const ok = await isUsernameAvailable(v);
        if (alive) setStatus(ok ? "available" : "taken");
      } catch {
        if (alive) setStatus("error");
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [value, current]);
  return status;
};

const STATUS_TEXT = {
  invalid: "3–32 characters: letters, numbers or _",
  checking: "Checking…",
  available: "Available",
  taken: "Already taken",
  error: "Couldn't check right now",
};

const Profile = ({ me, onSave, onAvatarChange, onAvatarRemove, onChangePassword, onLogout }) => {
  const fileId = useId();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(null);
  const [showEmail, setShowEmail] = useState(false);
  const toggle = (key) => setOpen((o) => (o === key ? null : key));

  // ---------- avatar ----------
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  useEffect(() => {
    if (!avatarMenu) return;
    const close = (e) => menuRef.current && !menuRef.current.contains(e.target) && setAvatarMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [avatarMenu]);

  const pickAvatar = async (file) => {
    if (!file) return;
    setAvatarMenu(false);
    setAvatarError("");
    setPreview(URL.createObjectURL(file));
    setAvatarBusy(true);
    try {
      await onAvatarChange(file);
    } catch (e) {
      setAvatarError(e.message || "Couldn't upload photo");
    } finally {
      setAvatarBusy(false);
      setPreview(null);
    }
  };

  const deleteAvatar = async () => {
    setAvatarMenu(false);
    setAvatarError("");
    setAvatarBusy(true);
    try {
      await onAvatarRemove();
    } catch (e) {
      setAvatarError(e.message || "Couldn't remove photo");
    } finally {
      setAvatarBusy(false);
    }
  };

  // ---------- name + username ----------
  const currentUsername = stripAt(me.username);
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(currentUsername);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const usernameStatus = useUsernameStatus(username, currentUsername);

  // keep fields in sync if the profile reloads
  useEffect(() => setName(me.name), [me.name]);
  useEffect(() => setUsername(currentUsername), [currentUsername]);

  const dirty = name.trim() !== me.name || username.trim().toLowerCase() !== currentUsername;
  const canSave = dirty && name.trim().length > 0 && ["same", "available"].includes(usernameStatus) && !saving;

  const saveProfile = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave({ name: name.trim(), username: username.trim().toLowerCase() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setSaveError(e.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  // ---------- password ----------
  const [pw, setPw] = useState({ old: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!pw.old || !pw.next) return setPwMsg("Fill in all fields.");
    if (pw.next.length < 8) return setPwMsg("New password must be at least 8 characters.");
    if (pw.next !== pw.confirm) return setPwMsg("Passwords don't match.");
    setPwBusy(true);
    try {
      await onChangePassword(pw.old, pw.next);
      setPw({ old: "", next: "", confirm: "" });
      setPwMsg("Password updated.");
    } catch (err) {
      setPwMsg(err.message || "Couldn't update password.");
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* fixed header — only the content below scrolls */}
      <div className="shrink-0 border-b border-white/5">
        <PanelHeader eyebrow="Account" title="Profile" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">

      {/* Avatar + identity */}
      <div className="flex flex-col items-center text-center px-6 pt-6 pb-8">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => (me.avatar ? setAvatarMenu((v) => !v) : document.getElementById(fileId)?.click())}
            className="group relative rounded-full"
            aria-label={me.avatar ? "Change or remove photo" : "Add photo"}
            disabled={avatarBusy}
          >
            <Avatar name={me.name} src={preview ?? me.avatar} size="2xl" />
            <span className="absolute inset-0 rounded-full grid place-items-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
              <FiCamera size={26} className="text-white" />
            </span>
            {avatarBusy && (
              <span className="absolute inset-0 rounded-full grid place-items-center bg-black/60">
                <FiLoader size={26} className="text-white animate-spin" />
              </span>
            )}
          </button>
          <label
            htmlFor={fileId}
            className="absolute bottom-1 right-1 w-10 h-10 grid place-items-center rounded-full bg-white text-black cursor-pointer hover:scale-105 transition-transform shadow-lg"
            title={me.avatar ? "Change photo" : "Add photo"}
          >
            <FiCamera size={16} />
          </label>
          <input
            id={fileId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              pickAvatar(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {avatarMenu && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-20 w-52">
            <div className="glass-strong py-1 text-left animate-fade-up">
              <label htmlFor={fileId} className="flex items-center gap-3 px-4 h-11 text-sm text-white hover:bg-white/10 cursor-pointer">
                <FiCamera size={16} /> Change photo
              </label>
              <button onClick={deleteAvatar} className="w-full flex items-center gap-3 px-4 h-11 text-sm text-white hover:bg-white/10">
                <FiTrash2 size={16} /> Remove photo
              </button>
            </div>
            </div>
          )}
        </div>
        {!me.avatar && !avatarBusy && <p className="eyebrow mt-4">Tap to add a photo</p>}
        {avatarError && <p className="mt-3 text-sm text-white border-l-2 border-white pl-3">{avatarError}</p>}
        <DisplayName name={me.name} className="mt-6" />
        <p className="eyebrow mt-2 normal-case tracking-wider max-w-full break-all">{me.username}</p>
      </div>

      <div className="px-4 pb-32 md:pb-10 space-y-3">
        {/* Email */}
        <div className="glass flex items-center justify-between gap-4 px-5 h-16">
          <div className="min-w-0">
            <p className="eyebrow">Email</p>
            <p className="text-sm text-white truncate mt-0.5">{showEmail ? me.email : maskEmail(me.email)}</p>
          </div>
          <button onClick={() => setShowEmail((v) => !v)} className="icon-btn" aria-label={showEmail ? "Hide email" : "Show email"}>
            {showEmail ? <FiEyeOff size={18} /> : <FiEye size={18} />}
          </button>
        </div>

        {/* Name + username */}
        <Accordion title="Name & username" icon={FiUser} open={open === "profile"} onToggle={() => toggle("profile")}>
          <form
            className="space-y-4 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile();
            }}
          >
            <div>
              <label htmlFor="profile-name" className="eyebrow block mb-2">Display name</label>
              <input id="profile-name" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} className="field" />
            </div>
            <div>
              <label htmlFor="profile-username" className="eyebrow block mb-2">Username</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">@</span>
                <input
                  id="profile-username"
                  value={username}
                  maxLength={32}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
                  className="field pl-9 pr-10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && <FiLoader size={16} className="text-ink-400 animate-spin" />}
                  {usernameStatus === "available" && <FiCheck size={16} className="text-white" />}
                  {(usernameStatus === "taken" || usernameStatus === "invalid") && <FiX size={16} className="text-ink-300" />}
                </span>
              </div>
              <p className={`text-xs mt-2 ${usernameStatus === "available" ? "text-white" : "text-ink-400"}`}>
                {STATUS_TEXT[usernameStatus] ?? "People can find you by this name."}
              </p>
            </div>
            {saveError && <p className="text-sm text-white border-l-2 border-white pl-3">{saveError}</p>}
            <button type="submit" disabled={!canSave} className="btn-solid w-full">
              {saving ? "Saving…" : saved ? (<><FiCheck size={16} /> Saved</>) : "Save changes"}
            </button>
          </form>
        </Accordion>

        {/* Password */}
        <Accordion title="Password & security" icon={FiShield} open={open === "password"} onToggle={() => toggle("password")}>
          <form onSubmit={submitPassword} className="space-y-4 pt-4">
            {[
              ["old", "Current password", "current-password"],
              ["next", "New password", "new-password"],
              ["confirm", "Confirm new password", "new-password"],
            ].map(([key, label, ac]) => (
              <div key={key}>
                <label className="eyebrow block mb-2">{label}</label>
                <input
                  type="password"
                  autoComplete={ac}
                  value={pw[key]}
                  onChange={(e) => {
                    setPw((p) => ({ ...p, [key]: e.target.value }));
                    setPwMsg(null);
                  }}
                  className="field"
                />
              </div>
            ))}
            {pwMsg && <p className="text-sm text-ink-200">{pwMsg}</p>}
            <button type="submit" disabled={pwBusy} className="btn-solid w-full">
              {pwBusy ? "Updating…" : "Update password"}
            </button>
          </form>
        </Accordion>

        <NotificationSettings />

        <InstallApp />

        <button onClick={onLogout} className="btn w-full !mt-8 h-12">
          <FiLogOut size={16} /> Log out
        </button>
      </div>
      </div>
    </div>
  );
};

export default Profile;
