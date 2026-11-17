import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MdOutlineKeyboardArrowLeft } from "react-icons/md";
import { FiPhone, FiInfo, FiClock, FiVideo, FiUsers, FiArrowDown } from "react-icons/fi";
import Avatar from "../ui/Avatar";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";
import AudioRecorder from "./AudioRecorder";
import VideoNoteRecorder from "./VideoNoteRecorder";
import FileSender from "./FileSender";
import MessageActions from "./MessageActions";
import { formatDayLabel, isNewDay } from "../../lib/format";

/** Unified chat window (replaces the duplicated Inbox / InboxMobile). */
const Conversation = ({
  chat, user, users, myId, quotes, onNeedQuotes, onReact, ongoingCall, onJoinCall, onBack, onShowInfo, onCall,
  onSendText, onSendAudio, onSendVideoNote, onSendFiles, onUnblock, onLoadOlder,
}) => {
  const [recorder, setRecorder] = useState(null); // null | { mode: "audio" | "video", autoStart }
  const [filesOpen, setFilesOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // message being replied to
  const [actionsFor, setActionsFor] = useState(null); // message whose menu is open
  const [highlighted, setHighlighted] = useState(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scrollRef = useRef(null);

  // The list is a bottom-anchored (column-reverse) scroller: it opens at the newest message
  // instantly, stays there when images load or new messages arrive, and older pages are
  // added above without moving what you're looking at.
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }, []);
  useLayoutEffect(() => scrollToBottom(), [chat.id, scrollToBottom]);

  // my own new message -> always show it
  const last = chat.messages.at(-1);
  useEffect(() => {
    if (last?.sentByMe && last.pending) scrollToBottom(true);
  }, [last?.id, last?.sentByMe, last?.pending, scrollToBottom]);

  const onScroll = (e) => setAwayFromBottom(e.currentTarget.scrollTop < -400);

  // load originals of replies that aren't on screen
  const byId = new Map(chat.messages.map((m) => [m.id, m]));
  const missingQuotes = chat.messages.filter((m) => m.replyTo && !byId.has(m.replyTo) && !quotes?.[m.replyTo]).map((m) => m.replyTo);
  const missingKey = missingQuotes.join(",");
  useEffect(() => {
    if (missingKey) onNeedQuotes?.(missingKey.split(","));
  }, [missingKey, onNeedQuotes]);
  const findMessage = (id) => byId.get(id) ?? quotes?.[id];
  const nameOf = (m) => (!m ? undefined : m.sentByMe ? "You" : users?.[m.senderId]?.name ?? (chat.isGroup ? "Member" : user.name));

  const jumpTo = (id) => {
    const el = scrollRef.current?.querySelector(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(id);
    setTimeout(() => setHighlighted((h) => (h === id ? null : h)), 1600);
  };

  const startReply = (m) => {
    setReplyTo(m);
    navigator.vibrate?.(10);
  };
  const takeReply = () => {
    const id = replyTo?.id;
    setReplyTo(null);
    return id;
  };

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-2 sm:px-5 pt-safe h-[calc(72px+env(safe-area-inset-top))] border-b border-white/10 bg-black/90 backdrop-blur-xl z-10">
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

      {/* Messages (bottom-anchored) */}
      <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto flex flex-col-reverse px-3 sm:px-6 bg-grid">
      <div className="shrink-0 min-h-full flex flex-col pb-6">
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
          <div className="flex-1 grid place-items-center eyebrow">Loading…</div>
        )}
        {chat.messages.length === 0 && !chat.loadingMessages && (
          <div className="flex-1 grid place-items-center text-center">
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
              <MessageBubble
                message={m}
                grouped={grouped}
                senderName={senderName}
                myId={myId}
                quote={m.replyTo ? findMessage(m.replyTo) : undefined}
                quoteName={m.replyTo ? nameOf(findMessage(m.replyTo)) : undefined}
                highlighted={highlighted === m.id}
                onReply={startReply}
                onReact={onReact}
                onOpenActions={setActionsFor}
                onJumpTo={jumpTo}
              />
              {/* "Seen" under my latest message once the other person (or someone in the group) opened the chat */}
              {i === chat.messages.length - 1 && m.sentByMe && m.read && (
                <p className="text-right pr-1 mt-1 text-[11px] text-ink-400 animate-fade-up">
                  {chat.isGroup ? `Seen by ${m.seenBy}` : "Seen"}
                </p>
              )}
            </div>
          );
        })}
      </div>
      </div>

        {/* back to the newest message */}
        {awayFromBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            aria-label="Go to newest message"
            className="absolute right-4 bottom-4 w-11 h-11 rounded-full glass-strong grid place-items-center text-white shadow-xl animate-fade-up"
          >
            <FiArrowDown size={18} />
            {chat.unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-white text-black text-[10px] font-bold grid place-items-center">
                {chat.unread}
              </span>
            )}
          </button>
        )}
      </div>

      {chat.blocked ? (
        <div className="shrink-0 px-5 py-4 pb-safe border-t border-white/10 bg-black/60 backdrop-blur-xl flex items-center justify-between gap-4">
          <p className="text-sm text-ink-300">You blocked this user.</p>
          <button onClick={onUnblock} className="btn-ghost h-9">Unblock</button>
        </div>
      ) : (
        <Composer
          key={chat.id}
          replyTo={replyTo ? { name: nameOf(replyTo), preview: replyTo } : null}
          onCancelReply={() => setReplyTo(null)}
          onSendText={(text) => onSendText(text, takeReply())}
          onAttach={() => setFilesOpen(true)}
          onRecord={(mode, opts) => setRecorder({ mode, autoStart: !!opts?.autoStart })}
        />
      )}

      <AudioRecorder
        open={recorder?.mode === "audio"}
        autoStart={recorder?.autoStart}
        onClose={() => setRecorder(null)}
        onSend={(audio) => onSendAudio(audio, takeReply())}
      />
      <VideoNoteRecorder
        open={recorder?.mode === "video"}
        autoStart={recorder?.autoStart}
        onClose={() => setRecorder(null)}
        onSend={(video) => onSendVideoNote?.(video, takeReply())}
      />
      <FileSender open={filesOpen} onClose={() => setFilesOpen(false)} onSend={(files, caption) => onSendFiles(files, caption, takeReply())} />
      <MessageActions
        message={actionsFor}
        myReaction={actionsFor?.reactions?.[myId]}
        onReact={(e) => onReact(actionsFor, e)}
        onReply={() => startReply(actionsFor)}
        onClose={() => setActionsFor(null)}
      />
    </div>
  );
};

export default Conversation;
