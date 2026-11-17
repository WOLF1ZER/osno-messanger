import { FiFileText, FiDownload, FiMic, FiVideo } from "react-icons/fi";
import { formatBytes, formatListTime, truncateMiddle } from "../../lib/format";
import { useFileUrl } from "../../lib/useFileUrl";

const SharedItem = ({ m }) => {
  const url = useFileUrl(m);
  return (
    <li className="flex items-center gap-3 px-3 py-2 border border-white/10">
      {m.type === "image" ? (
        url ? <img src={url} alt="" className="w-10 h-10 object-cover" /> : <div className="w-10 h-10 bg-white/10 animate-pulse" />
      ) : (
        <div className="w-10 h-10 grid place-items-center bg-white/10">
          {m.type === "audio" ? <FiMic size={16} /> : m.type === "video" ? <FiVideo size={16} /> : <FiFileText size={16} />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{m.type === "audio" ? "Voice message" : m.type === "video" ? "Video message" : truncateMiddle(m.fileName ?? "File", 26)}</p>
        <p className="text-[11px] text-ink-400 uppercase tracking-wider">
          {formatListTime(m.timestamp)}
          {m.fileSize ? ` · ${formatBytes(m.fileSize)}` : ""}
        </p>
      </div>
      <a href={url ?? undefined} download={m.fileName} target="_blank" rel="noopener noreferrer" className="icon-btn w-9 h-9" aria-label="Download">
        <FiDownload size={16} />
      </a>
    </li>
  );
};

/** Photos, files and voice notes shared in a chat (newest first). */
const SharedFiles = ({ messages }) =>
  messages.length === 0 ? (
    <p className="eyebrow pt-4">Nothing shared yet</p>
  ) : (
    <ul className="space-y-2 pt-3 max-h-72 overflow-y-auto">
      {messages
        .slice()
        .reverse()
        .map((m) => (
          <SharedItem key={m.id} m={m} />
        ))}
    </ul>
  );

export default SharedFiles;
