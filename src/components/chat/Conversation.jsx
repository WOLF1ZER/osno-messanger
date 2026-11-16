import { useEffect, useRef, useState } from "react";
import { MdOutlineKeyboardArrowLeft } from "react-icons/md";
import { FiPhone, FiInfo, FiClock, FiVideo, FiUsers } from "react-icons/fi";
import Avatar from "../ui/Avatar";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";
import AudioRecorder from "./AudioRecorder";
import FileSender from "./FileSender";
import { formatDayLabel, isNewDay } from "../../lib/format";

/** Unified chat window (replaces the duplicated Inbox / InboxMobile). */
const Conversation = ({
  chat, user, users, ongoingCall, onJoinCall, onBack, onShowInfo, onCall,
  onSendText, onSendAudio, onSendFiles, onUnblock, onLoadOlder,
}) => {
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const scrollRef = useRef(null);

  // keep the newest message in view (but not when older messages are prepended)
  const lastId = chat.messages.at(-1)?.id;
  const firstLoad = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstLoad.current ? "auto" : "smooth" });
    if (lastId) firstLoad.current = false;
  }, [lastId, chat.id]);

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-2 sm:px-5 h-[72px] border-b border-white/10 bg-black/60 backdrop-blur-xl z-10">
        <div className="flex items-center gap-1 min-w-0">
          <button onClick={onBack} className="icon-btn md:hidden" aria-label="Back to chats">
            <MdOutlineKeyboardArrowLeft size={28} />
          </button>
          <button onClick={onShowInfo} className="flex items-center gap-3 min-w-0 text-left rounded-full pr-3 hover:bg-white/[0.04] transition-colors">
            <Avatar name={user.name} src={user.avatar} online={user.online} group={chat.isGroup} />
            <div className="min-w-0">
              <h2 className="font-display uppercase tracking-wider font-semibold text-white text-lg leading-tight truncate">
                {user.name}
              </h2>
              <p className="text-xs text-ink-400 truncate">{chat.blocked ? "Blocked" : user.status}</p>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onCall(false)} className="icon-btn" aria-label="Voice call" title="Voice call" disabled={chat.blocked}>
            <FiPhone size={19} />
          </button>
          <button onClick={() => onCall(true)} className="icon-btn" aria-label="Video call" title="Video call" disabled={chat.blocked}>
            <FiVideo size={19} />
          </button>
          <button onClick={onShowInfo} className="icon-btn" aria-label="Chat info" title="Chat info">
            <FiInfo size={19} />
          </button>
        </div>
      </header>

      {/* A group call is going on in this chat */}
      {ongoingCall && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-white text-black z-10">
          <span className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              <span className="absolute inset-0 rounded-full bg-black animate-ping opacity-60" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-black" />
            </span>
            <span className="truncate">
              {ongoingCall.video ? "Video" : "Voice"} call in progress · {ongoingCall.inCall.length} joined
            </span>
          </span>
          <button onClick={() => onJoinCall(ongoingCall)} className="h-8 px-4 rounded-full bg-black text-white text-xs font-display uppercase tracking-wider2 font-semibold shrink-0">
            Join
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 pb-6 bg-grid">
        {chat.privateMode && (
          <div className="flex justify-center pt-4">
            <span className="flex items-center gap-2 glass px-4 py-2 eyebrow text-ink-200">
              <FiClock size={12} /> Messages disappear after 24 hours
            </span>
          </div>
        )}
        {chat.hasMore && chat.messages.length > 0 && (
          <div className="flex justify-center pt-4">
            <button onClick={onLoadOlder} disabled={chat.loadingMessages} className="btn-ghost h-9">
              {chat.loadingMessages ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {chat.messages.length === 0 && chat.loadingMessages && (
          <div className="h-full grid place-items-center eyebrow">Loading…</div>
        )}
        {chat.messages.length === 0 && !chat.loadingMessages && (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="eyebrow mb-2">{chat.isGroup ? "New group" : "New conversation"}</p>
              <p className="font-display uppercase tracking-wider text-2xl text-white [overflow-wrap:anywhere]">
                {chat.isGroup ? <><FiUsers className="inline -mt-1 mr-2" size={20} />Say hello to the group</> : `Say hello to ${user.name.split(" ")[0]}`}
              </p>
            </div>
          </div>
        )}
        {chat.messages.map((m, i) => {
          const prev = chat.messages[i - 1];
          const newDay = isNewDay(prev, m);
          const grouped =
            !newDay && prev && prev.type !== "system" && prev.senderId === m.senderId && m.timestamp - prev.timestamp < 5 * 60_000;
          const senderName = chat.isGroup || m.type === "system" ? users?.[m.senderId]?.name : undefined;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="flex items-center gap-4 my-6">
                  <span className="divider flex-1" />
                  <span className="eyebrow">{formatDayLabel(m.timestamp)}</span>
                  <span className="divider flex-1" />
                </div>
              )}
              <MessageBubble message={m} grouped={grouped} senderName={senderName} />
            </div>
          );
        })}
      </div>

      {chat.blocked ? (
        <div className="shrink-0 px-5 py-4 pb-safe border-t border-white/10 bg-black/60 backdrop-blur-xl flex items-center justify-between gap-4">
          <p className="text-sm text-ink-300">You blocked this user.</p>
          <button onClick={onUnblock} className="btn-ghost h-9">Unblock</button>
        </div>
      ) : (
        <Composer
          onSendText={onSendText}
          onAttach={() => setFilesOpen(true)}
          onRecord={() => setRecorderOpen(true)}
        />
      )}

      <AudioRecorder open={recorderOpen} onClose={() => setRecorderOpen(false)} onSend={onSendAudio} />
      <FileSender open={filesOpen} onClose={() => setFilesOpen(false)} onSend={onSendFiles} />
    </div>
  );
};

export default Conversation;
