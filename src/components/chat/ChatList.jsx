import { useMemo, useState } from "react";
import { MdPushPin } from "react-icons/md";
import { FiEdit, FiBellOff } from "react-icons/fi";
import { IoCheckmark, IoCheckmarkDone } from "react-icons/io5";
import Avatar from "../ui/Avatar";
import PanelHeader from "../ui/PanelHeader";
import SearchField from "../ui/SearchField";
import { formatListTime, messagePreview } from "../../lib/format";

const firstName = (name = "") => name.split(" ")[0];

/** Last-message line: "You: …", "Bob: …" in groups, or "Alex added Nora" for system notes. */
const previewOf = (c, users) => {
  const m = c.last;
  if (!m) return { prefix: "", text: c.isGroup ? "Group created" : "No messages yet" };
  const who = m.sentByMe ? "You" : firstName(users[m.senderId]?.name ?? "");
  if (m.type === "system") return { prefix: "", text: `${who || "Someone"} ${m.text}` };
  if (m.sentByMe) return { prefix: "You: ", text: messagePreview(m) };
  if (c.isGroup && who) return { prefix: `${who}: `, text: messagePreview(m) };
  return { prefix: "", text: messagePreview(m) };
};

/** One list for both mobile and desktop, direct chats and groups. */
const ChatList = ({ chats, users, peerOf, activeChatId, onOpen, onNewChat, loading, banner }) => {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats
      .map((c) => ({ ...c, user: peerOf(c), last: c.messages.at(-1) }))
      .filter((c) => c.user)
      .map((c) => ({ ...c, preview: previewOf(c, users) }))
      .filter((c) => !q || c.user.name.toLowerCase().includes(q) || c.preview.text.toLowerCase().includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.last?.timestamp ?? 0) - (a.last?.timestamp ?? 0));
  }, [chats, users, peerOf, query]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader
        eyebrow={`${chats.length} conversation${chats.length === 1 ? "" : "s"}`}
        title="Messages"
        right={
          <button onClick={onNewChat} className="icon-btn" aria-label="New chat" title="New chat">
            <FiEdit size={18} />
          </button>
        }
      />
      <div className="px-5 pb-4">
        <SearchField value={query} onChange={setQuery} placeholder="Search chats" />
      </div>
      {banner}
      <div className="divider" />

      <ul className="flex-1 min-h-0 overflow-y-auto py-2 pb-28 md:pb-2">
        {loading && <li className="px-5 py-16 text-center eyebrow">Loading chats…</li>}
        {!loading && rows.length === 0 && (
          <li className="px-5 py-16 text-center">
            <p className="eyebrow">{query ? "No matches" : "No chats yet"}</p>
            {!query && (
              <button onClick={onNewChat} className="btn mt-6">
                Find people
              </button>
            )}
          </li>
        )}
        {rows.map((c, i) => {
          const active = c.id === activeChatId;
          return (
            <li key={c.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-fade-up">
              <button
                onClick={() => onOpen(c.id)}
                className={`relative w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors duration-200 ${
                  active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                {active && <span className="absolute left-0 inset-y-3 w-[2px] bg-white" />}
                <Avatar name={c.user.name} src={c.user.avatar} online={c.user.online} group={c.isGroup} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4 className="font-semibold text-white truncate">{c.user.name}</h4>
                    <span className={`text-[11px] shrink-0 ${c.unread ? "text-white" : "text-ink-400"}`}>
                      {formatListTime(c.last?.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-0.5">
                    <p className={`text-sm truncate ${c.unread ? "text-ink-200" : "text-ink-400"}`}>
                      {c.last?.sentByMe && c.last.type !== "system" && !c.last.pending && (
                        <span className="inline-block align-[-2px] mr-1 text-ink-300" aria-label={c.last.read ? "Seen" : "Sent"}>
                          {c.last.read ? <IoCheckmarkDone size={14} /> : <IoCheckmark size={14} />}
                        </span>
                      )}
                      {c.preview.prefix && <span className="text-ink-300">{c.preview.prefix}</span>}
                      {c.preview.text}
                    </p>
                    <span className="flex items-center gap-2 shrink-0">
                      {c.muted && <FiBellOff size={12} className="text-ink-500" aria-label="Muted" />}
                      {c.pinned && <MdPushPin size={13} className="text-ink-400 rotate-45" />}
                      {c.unread > 0 && (
                        <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold grid place-items-center ${c.muted ? "bg-ink-500 text-white" : "bg-white text-black"}`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

    </div>
  );
};

export default ChatList;
