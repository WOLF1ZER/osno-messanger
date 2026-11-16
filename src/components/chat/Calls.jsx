import { useMemo, useState } from "react";
import { FiPhone, FiPhoneMissed, FiArrowDownLeft, FiArrowUpRight, FiVideo } from "react-icons/fi";
import Avatar from "../ui/Avatar";
import PanelHeader from "../ui/PanelHeader";
import { formatDuration, formatListTime } from "../../lib/format";

const FILTERS = [
  ["all", "All"],
  ["missed", "Missed"],
];

/** Call history with an All / Missed switch (Telegram-style). */
const Calls = ({ calls, users, chatsById, onCall, onOpenChat, onJoin, loading }) => {
  const [filter, setFilter] = useState("all");
  const rows = useMemo(
    () => calls.filter((c) => filter === "all" || c.missed).sort((a, b) => b.timestamp - a.timestamp),
    [calls, filter],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader eyebrow="Recent" title="Calls" />

      <div className="px-5 pb-4">
        <div className="grid grid-cols-2 border border-white/10 p-1">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`h-9 label text-[12px] transition-colors ${
                filter === id ? "bg-white text-black" : "text-ink-300 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="divider" />

      <ul className="flex-1 min-h-0 overflow-y-auto py-2 pb-28 md:pb-2">
        {loading && <li className="px-5 py-16 text-center eyebrow">Loading…</li>}
        {!loading && rows.length === 0 && (
          <li className="px-5 py-16 text-center eyebrow">{filter === "missed" ? "No missed calls" : "No calls yet"}</li>
        )}
        {rows.map((c, i) => {
          const chat = c.isGroup ? chatsById[c.chatId] : null;
          if (c.isGroup && !chat) return null; // a group you left
          const user = c.isGroup ? { name: chat.title, avatar: null, online: false } : users[c.userId];
          if (!user) return null;
          const live = c.isGroup && ["ringing", "active"].includes(c.status) && Date.now() - c.timestamp < 6 * 3600e3;
          const DirIcon = c.missed ? FiPhoneMissed : c.direction === "incoming" ? FiArrowDownLeft : FiArrowUpRight;
          const label =
            c.status === "ringing" || c.status === "active"
              ? c.isGroup ? `In progress · ${c.inCall.length} joined` : "In progress"
              : c.isGroup && !c.missed
                ? `Group${c.video ? " video" : ""} call · ${formatDuration(c.duration)}`
                : c.missed
                ? c.direction === "incoming"
                  ? c.status === "declined" ? "Declined" : "Missed"
                  : { cancelled: "Cancelled", declined: "Declined", missed: "No answer" }[c.status]
                : `${c.direction === "incoming" ? "Incoming" : "Outgoing"}${c.video ? " video" : ""} · ${formatDuration(c.duration)}`;
          return (
            <li key={c.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-fade-up">
              <div className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.04] transition-colors">
                <button onClick={() => onOpenChat(c)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                  <Avatar name={user.name} src={user.avatar} online={user.online} group={c.isGroup} />
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold truncate ${c.missed && c.direction === "incoming" ? "text-white underline decoration-white/40 underline-offset-4" : "text-white"}`}>
                      {user.name}
                    </h4>
                    <p className={`flex items-center gap-1.5 text-sm ${c.missed ? "text-ink-200" : "text-ink-400"}`}>
                      <DirIcon size={14} className="shrink-0" />
                      <span className="truncate">{label}</span>
                      <span className="text-ink-500">·</span>
                      <span className="shrink-0">{formatListTime(c.timestamp)}</span>
                    </p>
                  </div>
                </button>
                {live ? (
                  <button
                    onClick={() => onJoin(c)}
                    className="h-9 px-4 shrink-0 rounded-full bg-white text-black text-xs font-display uppercase tracking-wider2 font-semibold"
                  >
                    Join
                  </button>
                ) : (
                  <button
                    onClick={() => onCall(c, c.video)}
                    className="w-10 h-10 shrink-0 grid place-items-center rounded-full border border-white/20 text-white hover:bg-white hover:text-black transition-colors"
                    aria-label={`Call ${user.name}`}
                  >
                    {c.video ? <FiVideo size={16} /> : <FiPhone size={16} />}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default Calls;
