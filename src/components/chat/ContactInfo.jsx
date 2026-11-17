import { useState } from "react";
import { IoClose } from "react-icons/io5";
import { FiSettings, FiLock, FiFolder, FiPhone, FiVideo, FiBellOff } from "react-icons/fi";
import { MdPushPin, MdBlock, MdDeleteOutline } from "react-icons/md";
import Avatar from "../ui/Avatar";
import DisplayName from "../ui/DisplayName";
import Accordion from "../ui/Accordion";
import Toggle from "../ui/Toggle";
import Modal from "../ui/Modal";
import SharedFiles from "./SharedFiles";

/** Details about the person you're chatting with (was ChatUserData). */
const ContactInfo = ({ chat, user, onClose, onCall, onTogglePin, onToggleMute, onToggleBlock, onTogglePrivate, onDelete }) => {
  const [open, setOpen] = useState("files");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toggle = (key) => setOpen((o) => (o === key ? null : key));

  const shared = chat.messages.filter((m) => m.type === "file" || m.type === "image" || m.type === "audio");

  const actionRow = "w-full flex items-center justify-between px-4 h-12 border border-white/10 text-sm transition-colors";

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="flex items-center justify-between px-5 pt-safe h-[calc(72px+env(safe-area-inset-top))] border-b border-white/10">
        <p className="label text-white">Contact info</p>
        <button onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
          <IoClose size={20} />
        </button>
      </div>

      <div className="flex flex-col items-center text-center px-6 pt-10 pb-8">
        <Avatar name={user.name} src={user.avatar} size="2xl" />
        <DisplayName name={user.name} className="mt-6" />
        <p className="eyebrow mt-2 normal-case tracking-wider max-w-full break-all">{user.username}</p>
        <p className="eyebrow mt-1">{chat.blocked ? "Blocked" : user.status}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => onCall(false)} disabled={chat.blocked} className="btn">
            <FiPhone size={15} /> Call
          </button>
          <button onClick={() => onCall(true)} disabled={chat.blocked} className="btn">
            <FiVideo size={15} /> Video
          </button>
        </div>
      </div>

      <div className="px-4 pb-10 space-y-3">
        <Accordion title="Chat settings" icon={FiSettings} open={open === "settings"} onToggle={() => toggle("settings")}>
          <div className="space-y-2 pt-3">
            <button onClick={onTogglePin} className={`${actionRow} hover:border-white/40`}>
              <span>{chat.pinned ? "Unpin chat" : "Pin chat"}</span>
              <MdPushPin size={18} className={chat.pinned ? "text-white" : "text-ink-400"} />
            </button>
            <div className={`${actionRow} hover:border-white/40`}>
              <span className="flex items-center gap-2"><FiBellOff size={15} className="text-ink-400" /> Mute notifications</span>
              <Toggle checked={!!chat.muted} onChange={onToggleMute} label="Mute notifications" />
            </div>
            <button onClick={onToggleBlock} className={`${actionRow} hover:bg-white hover:text-black`}>
              <span>{chat.blocked ? "Unblock user" : "Block user"}</span>
              <MdBlock size={18} />
            </button>
            <button onClick={() => setConfirmDelete(true)} className={`${actionRow} hover:bg-white hover:text-black`}>
              <span>Delete chat</span>
              <MdDeleteOutline size={19} />
            </button>
          </div>
        </Accordion>

        <Accordion title="Privacy" icon={FiLock} open={open === "privacy"} onToggle={() => toggle("privacy")}>
          <div className="flex items-center justify-between gap-4 pt-4">
            <div>
              <p className="text-sm text-white">Private mode</p>
              <p className="text-xs text-ink-400 mt-1">New messages disappear after 24 hours.</p>
            </div>
            <Toggle checked={!!chat.privateMode} onChange={onTogglePrivate} label="Private mode" />
          </div>
        </Accordion>

        <Accordion
          title={`Shared files (${shared.length})`}
          icon={FiFolder}
          open={open === "files"}
          onToggle={() => toggle("files")}
        >
          <SharedFiles messages={shared} />
        </Accordion>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete chat">
        <p className="text-sm text-ink-300 leading-relaxed">
          Delete your conversation with <span className="text-white">{user.name}</span>? This can&apos;t be undone.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-6">
          <button onClick={() => setConfirmDelete(false)} className="btn-ghost">Cancel</button>
          <button
            onClick={() => {
              setConfirmDelete(false);
              onDelete();
            }}
            className="btn-solid"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default ContactInfo;
