import { useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { FiFileText, FiDownload, FiCornerUpLeft, FiSmile } from "react-icons/fi";
import { IoCheckmarkDone, IoCheckmark, IoTimeOutline, IoAlertCircleOutline } from "react-icons/io5";
import AudioMessage from "./AudioMessage";
import { formatBytes, formatClock, messagePreview, truncateMiddle } from "../../lib/format";
import { useFileUrl } from "../../lib/useFileUrl";

/** "Alex added Nora" style notes in the middle of the conversation. */
const SystemNote = ({ message, senderName }) => (
  <div className="flex justify-center my-4 animate-fade-up">
    <span className="max-w-[90%] text-center px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs text-ink-300 [overflow-wrap:anywhere]">
      <span className="text-ink-100">{message.sentByMe ? "You" : senderName ?? "Someone"}</span> {message.text}
    </span>
  </div>
);

const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Reaction chips under a bubble: 👍 2  ❤️ 1 — mine highlighted, tap to toggle. */
const Reactions = ({ reactions, myId, mine, onReact }) => {
  const counts = {};
  for (const e of Object.values(reactions ?? {})) counts[e] = (counts[e] ?? 0) + 1;
  const list = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!list.length) return null;
  const myEmoji = reactions?.[myId];
  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : "justify-start"} max-w-[82%]`}>
      {list.map(([emoji, n]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          aria-label={`${emoji} ${n}${myEmoji === emoji ? ", yours" : ""}`}
          className={`h-7 px-2 rounded-full flex items-center gap-1 text-sm border transition-colors active:scale-95 ${
            myEmoji === emoji ? "bg-white text-black border-white" : "bg-white/[0.06] text-ink-100 border-white/10 hover:border-white/30"
          }`}
        >
          <span>{emoji}</span>
          {n > 1 && <span className="text-xs font-semibold tabular-nums">{n}</span>}
        </button>
      ))}
    </div>
  );
};

/** Quoted original inside a reply. */
const Quote = ({ quote, name, mine, onClick }) => (
  <button
    onClick={onClick}
    className={`block w-full text-left mb-1.5 pl-2.5 pr-2 py-1 rounded-lg border-l-2 ${
      mine ? "bg-black/[0.06] border-black/50" : "bg-white/[0.06] border-white/60"
    }`}
  >
    <span className={`block text-[11px] font-semibold uppercase tracking-wider truncate ${mine ? "text-black/70" : "text-ink-200"}`}>
      {name ?? "Message"}
    </span>
    <span className={`block text-[13px] truncate ${mine ? "text-black/60" : "text-ink-400"}`}>
      {quote ? messagePreview(quote) : "Original message"}
    </span>
  </button>
);

const MessageBubble = ({
  message, grouped, senderName, myId, quote, quoteName, highlighted, onReply, onReact, onOpenActions, onJumpTo,
}) => {
  const mine = message.sentByMe;
  const isImage = message.type === "image";
  const url = useFileUrl(["text", "system"].includes(message.type) ? null : message);
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const x = useMotionValue(0);
  const replyIconOpacity = useTransform(x, [0, 60], [0, 1]);

  if (message.type === "system") return <SystemNote message={message} senderName={senderName} />;

  const canAct = !message.pending && !message.failed;

  // long-press (phones) opens the actions menu
  const startPress = (e) => {
    if (!canAct || e.pointerType === "mouse") return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      navigator.vibrate?.(15);
      onOpenActions?.(message);
    }, 450);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const movePress = (e) => {
    const s0 = pressStart.current;
    if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 10) cancelPress();
  };

  return (
    <div
      data-mid={message.id}
      className={`group relative flex flex-col ${mine ? "items-end" : "items-start"} ${grouped ? "mt-1" : "mt-4"} animate-fade-up`}
    >
      {senderName && !mine && !grouped && (
        <span className="ml-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-300 max-w-[70%] truncate">{senderName}</span>
      )}

      {/* swipe-to-reply arrow (phones) */}
      {isTouch && canAct && (
        <motion.span style={{ opacity: replyIconOpacity }} className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white pointer-events-none">
          <FiCornerUpLeft size={16} />
        </motion.span>
      )}

      <div className={`flex items-center gap-1 max-w-full ${mine ? "flex-row-reverse" : ""}`}>
      <motion.div
        style={{ x }}
        drag={isTouch && canAct ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.45 }}
        dragSnapToOrigin
        onDragStart={cancelPress}
        onDragEnd={(_, info) => info.offset.x > 60 && onReply?.(message)}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerMove={movePress}
        onContextMenu={(e) => {
          if (!canAct) return;
          e.preventDefault();
          cancelPress();
          onOpenActions?.(message);
        }}
        className={`relative min-w-0 max-w-[82vw] sm:max-w-[min(70%,560px)] select-text ${isImage ? "p-1.5" : "px-4 py-2.5"} ${
          mine
            ? "bg-white text-black rounded-2xl rounded-br-md"
            : "bg-white/[0.07] border border-white/10 backdrop-blur-md text-ink-100 rounded-2xl rounded-bl-md"
        } ${highlighted ? "ring-2 ring-white/80 ring-offset-2 ring-offset-black transition-shadow" : ""}`}
      >
        {message.replyTo && (
          <Quote quote={quote} name={quoteName} mine={mine} onClick={() => onJumpTo?.(message.replyTo)} />
        )}
        {message.type === "text" && (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-[15px]">{message.text}</p>
        )}

        {message.type === "audio" && (
          <AudioMessage id={message.id} src={url} duration={message.duration} mine={mine} />
        )}

        {isImage && (
          <a href={url ?? undefined} target="_blank" rel="noopener noreferrer">
            {!url && <div className="w-60 h-40 rounded-xl bg-white/5 animate-pulse" />}
            <img
              src={url ?? undefined}
              alt={message.fileName ?? "Image"}
              className={`rounded-xl max-h-80 w-auto object-cover ${url ? "" : "hidden"} ${message.pending ? "opacity-60" : ""}`}
            />
          </a>
        )}

        {message.type === "file" && (
          <div className="flex items-center gap-3 py-1 min-w-[220px]">
            <div
              className={`w-11 h-11 shrink-0 grid place-items-center rounded-lg ${
                mine ? "bg-black/10" : "bg-white/10"
              }`}
            >
              <FiFileText size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" title={message.fileName}>
                {truncateMiddle(message.fileName, 26)}
              </p>
              <p className={`text-[11px] uppercase tracking-wider ${mine ? "text-black/55" : "text-ink-400"}`}>
                {formatBytes(message.fileSize)}
              </p>
            </div>
            <a
              href={url ?? undefined}
              download={message.fileName}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Download ${message.fileName}`}
              className={`w-9 h-9 shrink-0 grid place-items-center rounded-full border transition-colors ${
                mine ? "border-black/20 hover:bg-black hover:text-white" : "border-white/20 hover:bg-white hover:text-black"
              }`}
            >
              <FiDownload size={15} />
            </a>
          </div>
        )}

        {message.caption && <p className="px-2.5 pt-2 pb-1 text-[15px] break-words">{message.caption}</p>}

        <span
          className={`flex items-center justify-end gap-1 text-[10px] tabular-nums mt-1 ${
            isImage ? "px-2 pb-1" : ""
          } ${mine ? "text-black/50" : "text-ink-400"}`}
        >
          {formatClock(message.timestamp)}
          {mine && message.failed && (
            <span className="flex items-center gap-1 uppercase tracking-wider font-semibold">
              <IoAlertCircleOutline size={13} /> Not sent
            </span>
          )}
          {mine && !message.failed && (message.pending ? <IoTimeOutline size={12} /> : message.read ? <IoCheckmarkDone size={13} /> : <IoCheckmark size={13} />)}
        </span>
      </motion.div>

      {/* desktop: quick buttons on hover */}
      {!isTouch && canAct && (
        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onReply?.(message)} className="icon-btn w-8 h-8" aria-label="Reply" title="Reply">
            <FiCornerUpLeft size={15} />
          </button>
          <button onClick={() => onOpenActions?.(message)} className="icon-btn w-8 h-8" aria-label="React" title="React">
            <FiSmile size={15} />
          </button>
        </div>
      )}
      </div>

      <Reactions reactions={message.reactions} myId={myId} mine={mine} onReact={(e) => onReact?.(message, e)} />
    </div>
  );
};

export default MessageBubble;
