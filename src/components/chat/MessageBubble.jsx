import { FiFileText, FiDownload } from "react-icons/fi";
import { IoCheckmarkDone, IoCheckmark, IoTimeOutline, IoAlertCircleOutline } from "react-icons/io5";
import AudioMessage from "./AudioMessage";
import { formatBytes, formatClock, truncateMiddle } from "../../lib/format";
import { useFileUrl } from "../../lib/useFileUrl";

/** "Alex added Nora" style notes in the middle of the conversation. */
const SystemNote = ({ message, senderName }) => (
  <div className="flex justify-center my-4 animate-fade-up">
    <span className="max-w-[90%] text-center px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs text-ink-300 [overflow-wrap:anywhere]">
      <span className="text-ink-100">{message.sentByMe ? "You" : senderName ?? "Someone"}</span> {message.text}
    </span>
  </div>
);

const MessageBubble = ({ message, grouped, senderName }) => {
  const mine = message.sentByMe;
  const isImage = message.type === "image";
  const url = useFileUrl(["text", "system"].includes(message.type) ? null : message);

  if (message.type === "system") return <SystemNote message={message} senderName={senderName} />;

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} ${grouped ? "mt-1" : "mt-4"} animate-fade-up`}>
      {senderName && !mine && !grouped && (
        <span className="ml-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-300 max-w-[70%] truncate">{senderName}</span>
      )}
      <div
        className={`relative max-w-[82%] sm:max-w-[70%] lg:max-w-[60%] ${isImage ? "p-1.5" : "px-4 py-2.5"} ${
          mine
            ? "bg-white text-black rounded-2xl rounded-br-md"
            : "bg-white/[0.07] border border-white/10 backdrop-blur-md text-ink-100 rounded-2xl rounded-bl-md"
        }`}
      >
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
      </div>
    </div>
  );
};

export default MessageBubble;
