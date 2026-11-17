import { useId, useState } from "react";
import { IoClose } from "react-icons/io5";
import { FiPhone, FiVideo, FiEdit2, FiCheck, FiUserPlus, FiX, FiLogOut, FiLock, FiFolder, FiBellOff, FiUsers, FiCamera, FiLoader, FiTrash2 } from "react-icons/fi";
import { MdPushPin } from "react-icons/md";
import Avatar from "../ui/Avatar";
import DisplayName from "../ui/DisplayName";
import Accordion from "../ui/Accordion";
import Toggle from "../ui/Toggle";
import Modal from "../ui/Modal";
import PeoplePicker from "./PeoplePicker";
import SharedFiles from "./SharedFiles";
import { GROUP_LIMIT } from "../../lib/api";

/** Details and management for a group chat. */
const GroupInfo = ({
  chat, me, users, contactIds, onClose, onCall, onTogglePin, onToggleMute, onTogglePrivate,
  onRename, onAddMembers, onRemoveMember, onLeave, onOpenDirect, addPeople, onChangePhoto, onRemovePhoto,
}) => {
  const fileId = useId();
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [open, setOpen] = useState("members");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [renameError, setRenameError] = useState("");
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const toggle = (key) => setOpen((o) => (o === key ? null : key));

  const isOwner = chat.role === "owner";
  const members = chat.memberIds;
  const free = GROUP_LIMIT - members.length;
  const onlineCount = members.filter((id) => id !== me.id && users[id]?.online).length;
  const shared = chat.messages.filter((m) => ["file", "image", "audio", "video"].includes(m.type));

  // group photo — only the owner (creator) can change it; the server enforces this too
  const pickPhoto = async (file) => {
    if (!file || !isOwner) return;
    if (!file.type.startsWith("image/")) return setPhotoError("Please choose an image.");
    setPhotoError("");
    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);
    setPhotoBusy(true);
    try {
      await onChangePhoto?.(file);
    } catch (e) {
      setPhotoError(e.message || "Couldn't upload photo");
    } finally {
      setPhotoBusy(false);
      setPhotoPreview(null);
      URL.revokeObjectURL(preview);
    }
  };
  const removePhoto = async () => {
    setPhotoError("");
    setPhotoBusy(true);
    try {
      await onRemovePhoto?.();
    } catch (e) {
      setPhotoError(e.message || "Couldn't remove photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveTitle = async (e) => {
    e.preventDefault();
    if (!title.trim() || title.trim() === chat.title) return setEditing(false);
    try {
      await onRename(title.trim());
      setEditing(false);
      setRenameError("");
    } catch (err) {
      setRenameError(err.message);
    }
  };

  const add = async () => {
    setAddBusy(true);
    setAddError("");
    try {
      await onAddMembers(picked);
      setAdding(false);
      setPicked([]);
    } catch (e) {
      setAddError(e.message || "Couldn't add people");
    } finally {
      setAddBusy(false);
    }
  };

  const row = "w-full flex items-center justify-between px-4 h-12 border border-white/10 text-sm transition-colors";

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="flex items-center justify-between px-5 pt-safe h-[calc(72px+env(safe-area-inset-top))] border-b border-white/10">
        <p className="label text-white">Group info</p>
        <button onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
          <IoClose size={20} />
        </button>
      </div>

      <div className="flex flex-col items-center text-center px-6 pt-10 pb-8">
        <div className="relative">
          <Avatar name={chat.title} src={photoPreview ?? chat.avatar} size="2xl" group />
          {photoBusy && (
            <span className="absolute inset-0 w-36 h-36 rounded-full grid place-items-center bg-black/60">
              <FiLoader size={26} className="text-white animate-spin" />
            </span>
          )}
          {isOwner && (
            <>
              <label
                htmlFor={fileId}
                className="absolute bottom-1 left-1 w-10 h-10 grid place-items-center rounded-full bg-white text-black cursor-pointer hover:scale-105 transition-transform shadow-lg ring-2 ring-black"
                title={chat.avatar ? "Change group photo" : "Add group photo"}
                aria-label={chat.avatar ? "Change group photo" : "Add group photo"}
              >
                <FiCamera size={16} />
              </label>
              <input
                id={fileId}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoBusy}
                onChange={(e) => {
                  pickPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {isOwner && chat.avatar && !photoBusy && (
          <button onClick={removePhoto} className="mt-3 flex items-center gap-1.5 text-[12px] uppercase tracking-wider text-ink-400 hover:text-white">
            <FiTrash2 size={12} /> Remove photo
          </button>
        )}
        {photoError && <p className="mt-2 text-sm text-ink-200">{photoError}</p>}
        {editing ? (
          <form onSubmit={saveTitle} className="mt-6 w-full flex gap-2">
            <input autoFocus maxLength={64} value={title} onChange={(e) => setTitle(e.target.value)} className="field min-w-0" aria-label="Group name" />
            <button type="submit" className="icon-btn border border-white/20 w-12 h-12 shrink-0" aria-label="Save name">
              <FiCheck size={18} />
            </button>
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className="group mt-6 max-w-full flex items-center gap-2" title="Rename group">
            <DisplayName name={chat.title} />
            <FiEdit2 size={16} className="shrink-0 text-ink-400 group-hover:text-white" />
          </button>
        )}
        {renameError && <p className="mt-2 text-sm text-ink-200">{renameError}</p>}
        <p className="eyebrow mt-2 flex items-center gap-2">
          <FiUsers size={12} /> {members.length} of {GROUP_LIMIT} members{onlineCount ? ` · ${onlineCount} online` : ""}
        </p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => onCall(false)} className="btn">
            <FiPhone size={15} /> Call
          </button>
          <button onClick={() => onCall(true)} className="btn">
            <FiVideo size={15} /> Video
          </button>
        </div>
      </div>

      <div className="px-4 pb-10 space-y-3">
        <Accordion title={`Members (${members.length})`} icon={FiUsers} open={open === "members"} onToggle={() => toggle("members")}>
          <ul className="pt-3 space-y-1">
            {members.map((id) => {
              const u = id === me.id ? me : users[id];
              const owner = chat.ownerId === id;
              return (
                <li key={id} className="flex items-center gap-3 py-2">
                  <button
                    onClick={() => id !== me.id && onOpenDirect(id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    disabled={id === me.id}
                    title={id === me.id ? undefined : `Message ${u?.name ?? ""}`}
                  >
                    <Avatar name={u?.name ?? "?"} src={u?.avatar} size="sm" online={id !== me.id && u?.online} />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        {u?.name ?? "…"} {id === me.id && <span className="text-ink-400">(you)</span>}
                      </p>
                      <p className="text-[11px] text-ink-400 truncate">
                        {owner ? "Owner · " : ""}
                        {id === me.id ? me.username : u?.status ?? ""}
                      </p>
                    </div>
                  </button>
                  {isOwner && id !== me.id && (
                    <button onClick={() => setConfirmRemove(id)} className="icon-btn w-8 h-8" aria-label={`Remove ${u?.name ?? "member"}`}>
                      <FiX size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button onClick={() => setAdding(true)} disabled={free <= 0} className="btn-ghost w-full mt-3">
            <FiUserPlus size={15} /> {free > 0 ? `Add members (${free} left)` : "Group is full"}
          </button>
        </Accordion>

        <Accordion title="Settings" icon={FiBellOff} open={open === "settings"} onToggle={() => toggle("settings")}>
          <div className="space-y-2 pt-3">
            <div className={row}>
              <span>Mute notifications</span>
              <Toggle checked={!!chat.muted} onChange={onToggleMute} label="Mute notifications" />
            </div>
            <button onClick={onTogglePin} className={`${row} hover:border-white/40`}>
              <span>{chat.pinned ? "Unpin group" : "Pin group"}</span>
              <MdPushPin size={18} className={chat.pinned ? "text-white" : "text-ink-400"} />
            </button>
          </div>
        </Accordion>

        <Accordion title="Privacy" icon={FiLock} open={open === "privacy"} onToggle={() => toggle("privacy")}>
          <div className="flex items-center justify-between gap-4 pt-4">
            <div>
              <p className="text-sm text-white">Private mode</p>
              <p className="text-xs text-ink-400 mt-1">New messages disappear after 24 hours, for everyone.</p>
            </div>
            <Toggle checked={!!chat.privateMode} onChange={onTogglePrivate} label="Private mode" />
          </div>
        </Accordion>

        <Accordion title={`Shared files (${shared.length})`} icon={FiFolder} open={open === "files"} onToggle={() => toggle("files")}>
          <SharedFiles messages={shared} />
        </Accordion>

        <button onClick={() => setConfirmLeave(true)} className="btn-danger w-full !mt-6">
          <FiLogOut size={15} /> Leave group
        </button>
      </div>

      {/* add members */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add members" className="max-w-md !p-0 !pt-6 h-[min(640px,85vh)] flex flex-col [&>div:first-child]:px-6">
        <div className="flex-1 min-h-0">
          <PeoplePicker
            me={me}
            users={users}
            contactIds={contactIds}
            excludeIds={members}
            selected={picked}
            onChange={setPicked}
            onPick={(u) => addPeople?.([u])}
            max={free}
          />
        </div>
        <div className="shrink-0 p-5 border-t border-white/10">
          {addError && <p className="text-sm text-ink-200 mb-3">{addError}</p>}
          <button onClick={add} disabled={!picked.length || addBusy} className="btn-solid w-full">
            {addBusy ? "Adding…" : `Add ${picked.length || ""}`}
          </button>
        </div>
      </Modal>

      <Modal open={Boolean(confirmRemove)} onClose={() => setConfirmRemove(null)} title="Remove member">
        <p className="text-sm text-ink-300 leading-relaxed">
          Remove <span className="text-white">{users[confirmRemove]?.name ?? "this person"}</span> from the group?
        </p>
        <div className="grid grid-cols-2 gap-3 mt-6">
          <button onClick={() => setConfirmRemove(null)} className="btn-ghost">Cancel</button>
          <button
            onClick={() => {
              onRemoveMember(confirmRemove);
              setConfirmRemove(null);
            }}
            className="btn-solid"
          >
            Remove
          </button>
        </div>
      </Modal>

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave group">
        <p className="text-sm text-ink-300 leading-relaxed">
          Leave <span className="text-white">{chat.title}</span>? You won&apos;t get its messages anymore.
          {isOwner && members.length > 1 && " Ownership passes to the longest-standing member."}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-6">
          <button onClick={() => setConfirmLeave(false)} className="btn-ghost">Cancel</button>
          <button
            onClick={() => {
              setConfirmLeave(false);
              onLeave();
            }}
            className="btn-solid"
          >
            Leave
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default GroupInfo;
