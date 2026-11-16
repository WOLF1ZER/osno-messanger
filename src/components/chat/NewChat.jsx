import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiArrowRight, FiUsers, FiChevronRight } from "react-icons/fi";
import Avatar from "../ui/Avatar";
import PanelHeader from "../ui/PanelHeader";
import SearchField from "../ui/SearchField";
import PeoplePicker from "./PeoplePicker";
import { searchProfiles, toUiUser, GROUP_LIMIT } from "../../lib/api";

/** Step 2 of "New group": name it and create. */
const NameGroup = ({ users, selected, onBack, onCreate }) => {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give the group a name.");
    setBusy(true);
    setError("");
    const ok = await onCreate(title.trim(), selected);
    if (!ok) setBusy(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader eyebrow={`${selected.length + 1} of ${GROUP_LIMIT} members`} title="Name group" onBack={onBack} backAlways />
      <form onSubmit={create} className="flex-1 min-h-0 overflow-y-auto px-5 pb-28 md:pb-6 space-y-6">
        <div className="flex flex-col items-center pt-2">
          <Avatar name={title || "Group"} size="xl" group />
        </div>
        <div>
          <label htmlFor="group-title" className="eyebrow block mb-2">Group name</label>
          <input
            id="group-title"
            autoFocus
            maxLength={64}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError("");
            }}
            placeholder="e.g. Weekend trip"
            className="field"
          />
        </div>
        <div>
          <p className="eyebrow mb-3">Members</p>
          <ul className="space-y-2">
            {selected.map((id) => (
              <li key={id} className="flex items-center gap-3">
                <Avatar name={users[id]?.name ?? "?"} src={users[id]?.avatar} size="sm" />
                <span className="text-sm text-white truncate">{users[id]?.name ?? "…"}</span>
              </li>
            ))}
          </ul>
        </div>
        {error && <p className="text-sm text-white border-l-2 border-white pl-3">{error}</p>}
        <button type="submit" disabled={busy || !title.trim()} className="btn-solid w-full h-12">
          {busy ? "Creating…" : "Create group"}
        </button>
      </form>
    </div>
  );
};

/** Find people by name or @username and start a conversation — or create a group. */
const NewChat = ({ me, users, chats, onStart, onCreateGroup, addPeople }) => {
  const [mode, setMode] = useState("direct"); // direct | pick | name
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chatUserIds = useMemo(() => new Set(chats.filter((c) => !c.isGroup).map((c) => c.userId)), [chats]);
  const contactIds = useMemo(() => chats.filter((c) => !c.isGroup).map((c) => c.userId), [chats]);

  // debounced server search
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
        setResults((await searchProfiles(q, me.id)).map(toUiUser));
        setError("");
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, me.id]);

  if (mode === "pick") {
    return (
      <div className="flex flex-col h-full min-h-0">
        <PanelHeader eyebrow="Up to 4 people + you" title="New group" onBack={() => setMode("direct")} backAlways />
        <div className="flex-1 min-h-0">
          <PeoplePicker
            me={me}
            users={users}
            contactIds={contactIds}
            selected={selected}
            onChange={(ids) => setSelected(ids)}
            onPick={(u) => addPeople?.([u])}
            max={GROUP_LIMIT - 1}
          />
        </div>
        <div className="shrink-0 px-5 pt-3 pb-28 md:pb-5 border-t border-white/10">
          <button onClick={() => setMode("name")} disabled={!selected.length} className="btn-solid w-full h-12">
            Next {selected.length > 0 && `(${selected.length})`} <FiArrowRight />
          </button>
        </div>
      </div>
    );
  }

  if (mode === "name") {
    return (
      <NameGroup
        users={users}
        selected={selected}
        onBack={() => setMode("pick")}
        onCreate={async (title, ids) => {
          const ok = await onCreateGroup(title, ids);
          if (ok) {
            setSelected([]);
            setMode("direct");
          }
          return ok;
        }}
      />
    );
  }

  const list = query.trim() ? results : contactIds.map((id) => users[id]).filter(Boolean);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader eyebrow="Find people" title="New chat" />
      <div className="px-5 pb-4">
        <SearchField value={query} onChange={setQuery} placeholder="Name or @username" autoFocus />
      </div>
      <div className="divider" />
      <ul className="flex-1 min-h-0 overflow-y-auto py-2 pb-28 md:pb-2">
        {!query.trim() && (
          <li>
            <button
              onClick={() => setMode("pick")}
              className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.04] transition-colors"
            >
              <span className="w-12 h-12 rounded-full bg-white text-black grid place-items-center shrink-0">
                <FiUsers size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">New group</p>
                <p className="text-sm text-ink-400">Up to {GROUP_LIMIT} people, with group calls</p>
              </div>
              <FiChevronRight className="text-ink-400" />
            </button>
          </li>
        )}
        {!query.trim() && list.length > 0 && <li className="eyebrow px-5 pt-4 pb-1">Your contacts</li>}
        {busy && <li className="px-5 py-10 text-center eyebrow">Searching…</li>}
        {error && <li className="px-5 py-10 text-center text-sm text-ink-200">{error}</li>}
        {!busy && !error && query.trim() && list.length === 0 && <li className="px-5 py-16 text-center eyebrow">No users found</li>}
        {!busy &&
          list.map((u) => {
            const existing = chatUserIds.has(u.id);
            const live = users[u.id] ?? u;
            return (
              <li key={u.id}>
                <button
                  onClick={() => {
                    addPeople?.([u]);
                    onStart(u.id, u);
                  }}
                  className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.04] transition-colors group"
                >
                  <Avatar name={u.name} src={u.avatar} online={live.online} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{u.name}</p>
                    <p className="text-sm text-ink-400 truncate">{u.username}</p>
                  </div>
                  <span
                    className={`w-9 h-9 grid place-items-center rounded-full border transition-colors ${
                      existing
                        ? "border-white/15 text-ink-300 group-hover:text-white"
                        : "border-white/40 text-white group-hover:bg-white group-hover:text-black"
                    }`}
                    title={existing ? "Open chat" : "Start chat"}
                  >
                    {existing ? <FiArrowRight size={16} /> : <FiPlus size={16} />}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
};

export default NewChat;
