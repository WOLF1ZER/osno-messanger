import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import Avatar from "../ui/Avatar";
import SearchField from "../ui/SearchField";
import { searchProfiles, toUiUser } from "../../lib/api";

/**
 * Pick several people (search + your contacts), up to `max`.
 * Used to create a group and to add members to one.
 */
const PeoplePicker = ({ me, users, contactIds, excludeIds = [], selected, onChange, onPick, max }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [known, setKnown] = useState({}); // people seen in search results

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError("");
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const found = (await searchProfiles(q, me.id)).map(toUiUser);
        setResults(found);
        setKnown((k) => ({ ...k, ...Object.fromEntries(found.map((u) => [u.id, u])) }));
        setError("");
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, me.id]);

  const exclude = useMemo(() => new Set([me.id, ...excludeIds]), [me.id, excludeIds]);
  const list = (query.trim() ? results : contactIds.map((id) => users[id]).filter(Boolean)).filter((u) => !exclude.has(u.id));
  const person = (id) => users[id] ?? known[id];
  const full = selected.length >= max;

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (!full) {
      if (person(id)) onPick?.(person(id)); // remember people found via search
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-5 pb-3 space-y-3">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((id) => (
              <button
                key={id}
                onClick={() => toggle(id)}
                className="flex items-center gap-2 pl-1 pr-2.5 h-8 rounded-full bg-white text-black text-sm max-w-[180px]"
                aria-label={`Remove ${person(id)?.name ?? ""}`}
              >
                <Avatar name={person(id)?.name ?? "?"} src={person(id)?.avatar} size="xs" />
                <span className="truncate">{person(id)?.name?.split(" ")[0] ?? "…"}</span>
                <FiX size={13} className="shrink-0" />
              </button>
            ))}
          </div>
        )}
        <SearchField value={query} onChange={setQuery} placeholder="Search name or @username" />
        <p className="eyebrow">
          {selected.length}/{max} selected{full ? " · limit reached" : ""}
        </p>
      </div>
      <div className="divider" />
      <ul className="flex-1 min-h-0 overflow-y-auto py-2">
        {busy && <li className="px-5 py-8 text-center eyebrow">Searching…</li>}
        {error && <li className="px-5 py-8 text-center text-sm text-ink-200">{error}</li>}
        {!busy && !error && list.length === 0 && (
          <li className="px-5 py-10 text-center eyebrow">{query.trim() ? "No users found" : "Search for people to add"}</li>
        )}
        {!busy &&
          list.map((u) => {
            const on = selected.includes(u.id);
            const disabled = !on && full;
            return (
              <li key={u.id}>
                <button
                  onClick={() => toggle(u.id)}
                  disabled={disabled}
                  aria-pressed={on}
                  className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-40"
                >
                  <Avatar name={u.name} src={u.avatar} online={users[u.id]?.online} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{u.name}</p>
                    <p className="text-sm text-ink-400 truncate">{u.username}</p>
                  </div>
                  <span
                    className={`w-6 h-6 shrink-0 rounded-full grid place-items-center border transition-colors ${
                      on ? "bg-white border-white text-black" : "border-white/30"
                    }`}
                  >
                    {on && <FiCheck size={14} strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
};

export default PeoplePicker;
