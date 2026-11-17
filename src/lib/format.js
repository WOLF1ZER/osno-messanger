const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const formatClock = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Short label for chat-list rows: time today, weekday this week, else date. */
export const formatListTime = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return formatClock(ts);
  const diffDays = (now - d) / 86_400_000;
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
};

/** Separator label inside a conversation. */
export const formatDayLabel = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
};

export const isNewDay = (prev, curr) => !prev || !sameDay(new Date(prev.timestamp), new Date(curr.timestamp));

export const formatDuration = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

export const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

export const truncateMiddle = (name = "", max = 24) => {
  if (name.length <= max) return name;
  const extIdx = name.lastIndexOf(".");
  const ext = extIdx > 0 ? name.slice(extIdx) : "";
  return name.slice(0, max - ext.length - 1) + "…" + ext;
};

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export const messagePreview = (m) => {
  if (!m) return "No messages yet";
  if (m.type === "system") return m.text ?? m.caption ?? "";
  if (m.type === "audio") return "Voice message";
  if (m.type === "video") return "⭕ Video message";
  if (m.type === "image") return "Photo";
  if (m.type === "file") return m.fileName ?? "File";
  return m.text;
};

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (Math.random() * 16) >> (c / 4)).toString(16),
  );

export const formatLastSeen = (ts) => {
  if (!ts) return "last seen recently";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "last seen just now";
  if (diff < 3_600_000) return `last seen ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `last seen ${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `last seen ${new Date(ts).toLocaleDateString([], { weekday: "long" })}`;
  return `last seen ${new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" })}`;
};
