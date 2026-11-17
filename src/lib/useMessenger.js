import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import * as api from "./api";
import { formatLastSeen, uuid } from "./format";
import { playMessagePing } from "./sounds";

const rowToChat = (r, myId) => ({
  id: r.chat_id,
  isGroup: r.is_group,
  title: r.title,
  role: r.my_role,
  ownerId: r.owner_id,
  memberIds: r.member_ids ?? [],
  userId: r.is_group ? null : r.other_id,
  pinned: r.pinned,
  muted: r.muted,
  privateMode: r.private_mode,
  blocked: r.blocked_by_me,
  unread: r.unread,
  lastMessageAt: Date.parse(r.last_message_at),
  lastMessage: r.last_message ? api.toUiMessage(r.last_message, myId) : null,
});

const rowToUser = (r) =>
  api.toUiUser({ id: r.other_id, name: r.other_name, username: r.other_username, avatar_url: r.other_avatar, last_seen: r.other_last_seen });

/**
 * Chats, messages, people, presence and live updates for the signed-in user.
 * Messages for a chat load the first time it is opened, then stay in sync over Realtime.
 */
export const useMessenger = (me) => {
  const myId = me?.id;
  const [chats, setChats] = useState([]);
  const [people, setPeople] = useState({}); // id -> user
  const [threads, setThreads] = useState({}); // chatId -> { items, loading, hasMore }
  const [quotes, setQuotes] = useState({}); // messageId -> message (originals of replies that aren't loaded)
  const [receipts, setReceipts] = useState({}); // chatId -> { userId: readAt (ms) }
  const [online, setOnline] = useState(() => new Set());
  const [loadingChats, setLoadingChats] = useState(true);
  const [error, setError] = useState(null);
  const activeIdRef = useRef(null);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const fail = useCallback((err, fallback = "Something went wrong") => {
    console.error(err);
    setError(err?.message || fallback);
  }, []);

  const addPeople = useCallback((list) => {
    if (!list.length) return;
    setPeople((prev) => {
      const next = { ...prev };
      for (const u of list) if (u) next[u.id] = { ...next[u.id], ...u };
      return next;
    });
  }, []);

  /** Make sure we know these users (e.g. someone who calls us without a chat in the list). */
  const ensurePeople = useCallback(
    async (ids) => {
      const missing = [...new Set(ids)].filter((id) => id && !peopleRef.current[id]);
      if (!missing.length) return;
      try {
        addPeople((await api.fetchProfiles(missing)).map(api.toUiUser));
      } catch (e) {
        console.error(e);
      }
    },
    [addPeople],
  );

  // ---------------- chats ----------------
  const loadChats = useCallback(async () => {
    if (!myId) return;
    try {
      const rows = await api.fetchChats();
      setChats(rows.map((r) => rowToChat(r, myId)).filter((c) => c.isGroup || c.userId));
      addPeople(rows.filter((r) => r.other_id).map(rowToUser));
      api
        .fetchReadReceipts(rows.map((r) => r.chat_id))
        .then((list) => {
          const next = {};
          for (const r of list) (next[r.chat_id] ??= {})[r.user_id] = Date.parse(r.read_at);
          setReceipts(next);
        })
        .catch((e) => console.warn("receipts", e));
      ensurePeople(rows.flatMap((r) => r.member_ids ?? []).filter((id) => id !== myId));
    } catch (e) {
      fail(e, "Couldn't load chats");
    } finally {
      setLoadingChats(false);
    }
  }, [myId, addPeople, ensurePeople, fail]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const setReceipt = useCallback((chatId, userId, readAt) => {
    setReceipts((prev) => ({ ...prev, [chatId]: { ...prev[chatId], [userId]: Date.parse(readAt) } }));
  }, []);

  /** Mark the open chat as read — only when the app is actually on screen (counts as "seen"). */
  const markReadIfVisible = useCallback((chatId) => {
    if (chatId && document.visibilityState === "visible") api.markChatRead(chatId);
  }, []);

  const patchChat = (id, patch) => setChats((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // ---------------- messages ----------------
  const upsertMessages = useCallback((chatId, msgs) => {
    setThreads((prev) => {
      const t = prev[chatId] ?? { items: [], loading: false, hasMore: true, loaded: false };
      const byId = new Map(t.items.map((m) => [m.id, m]));
      for (const m of msgs) {
        const old = byId.get(m.id);
        byId.set(m.id, old ? { ...old, ...m, localUrl: old.localUrl ?? m.localUrl, pending: m.pending ?? false } : m);
      }
      const items = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
      return { ...prev, [chatId]: { ...t, items } };
    });
  }, []);

  const loadMessages = useCallback(
    async (chatId, { older = false } = {}) => {
      const t = threads[chatId];
      if (t?.loading || (older && !t?.hasMore) || (!older && t?.loaded)) return;
      setThreads((p) => ({ ...p, [chatId]: { items: [], hasMore: true, ...p[chatId], loading: true } }));
      try {
        const before = older && t?.items.length ? new Date(t.items[0].timestamp).toISOString() : undefined;
        const rows = await api.fetchMessages(chatId, before);
        upsertMessages(chatId, rows.map((r) => api.toUiMessage(r, myId)));
        setThreads((p) => ({
          ...p,
          [chatId]: { ...p[chatId], loading: false, loaded: true, hasMore: rows.length === api.PAGE_SIZE },
        }));
      } catch (e) {
        setThreads((p) => ({ ...p, [chatId]: { ...p[chatId], loading: false } }));
        fail(e, "Couldn't load messages");
      }
    },
    [threads, myId, upsertMessages, fail],
  );

  /**
   * Bring an already-loaded chat up to date (new messages + recent reactions).
   * Needed because phones drop the live connection in the background: anything sent meanwhile
   * would otherwise only show up after restarting the app.
   */
  const syncThread = useCallback(
    async (chatId) => {
      const t = threadsRef.current[chatId];
      if (!t?.loaded || t.loading) return;
      try {
        const rows = await api.fetchMessages(chatId); // newest page, with reactions
        const fresh = rows.map((r) => ({ ...api.toUiMessage(r, myId), pending: false }));
        const lastKnown = t.items.filter((m) => !m.pending && !m.failed).at(-1)?.timestamp ?? 0;
        if (fresh.length === api.PAGE_SIZE && fresh[0].timestamp > lastKnown) {
          // more than a page was missed: start this chat over from the newest page
          setThreads((p) => ({ ...p, [chatId]: { ...p[chatId], items: [...fresh, ...p[chatId].items.filter((m) => m.pending)], hasMore: true } }));
        } else {
          upsertMessages(chatId, fresh);
        }
        if (activeIdRef.current === chatId && fresh.some((m) => m.timestamp > lastKnown && !m.sentByMe)) {
          markReadIfVisible(chatId);
        }
      } catch (e) {
        console.warn("sync failed", e);
      }
    },
    [myId, upsertMessages, markReadIfVisible],
  );

  /** Full catch-up: chat list (unread counts) + every chat that's already open in memory. */
  const resync = useCallback(async () => {
    await loadChats();
    const ids = Object.keys(threadsRef.current);
    const active = activeIdRef.current;
    for (const id of [active, ...ids.filter((x) => x !== active)].filter(Boolean)) await syncThread(id);
    if (active) {
      patchChat(active, { unread: 0 });
      markReadIfVisible(active); // back on screen with this chat open -> it's seen now
    }
  }, [loadChats, syncThread, markReadIfVisible]);

  const setActiveChat = useCallback(
    (chatId) => {
      activeIdRef.current = chatId;
      if (!chatId) return;
      if (threadsRef.current[chatId]?.loaded) syncThread(chatId); // reopened: fetch what's new
      else loadMessages(chatId);
      patchChat(chatId, { unread: 0 });
      markReadIfVisible(chatId);
    },
    [loadMessages, syncThread, markReadIfVisible],
  );

  // catch up whenever the app comes back to the foreground or the network returns,
  // and check the open chat regularly while the app is on screen (safety net)
  useEffect(() => {
    if (!myId) return;
    const onVisible = () => document.visibilityState === "visible" && resync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", resync);
    window.addEventListener("focus", onVisible);
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadChats();
      if (activeIdRef.current) syncThread(activeIdRef.current);
    }, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", resync);
      window.removeEventListener("focus", onVisible);
      clearInterval(t);
    };
  }, [myId, resync, loadChats, syncThread]);

  // ---------------- replies ----------------
  /** Load originals of replies that aren't in memory (e.g. older than the loaded page). */
  const requestedQuotes = useRef(new Set());
  const ensureQuotes = useCallback(async (chatId, ids) => {
    const items = threadsRef.current[chatId]?.items ?? [];
    const missing = [...new Set(ids)].filter(
      (id) => id && !items.some((m) => m.id === id) && !requestedQuotes.current.has(id),
    );
    if (!missing.length) return;
    missing.forEach((id) => requestedQuotes.current.add(id)); // never ask twice (originals may be deleted)
    try {
      const rows = await api.fetchMessagesByIds(missing);
      setQuotes((q) => ({ ...q, ...Object.fromEntries(rows.map((r) => [r.id, api.toUiMessage(r, myId)])) }));
    } catch (e) {
      console.warn(e);
    }
  }, [myId]);

  // ---------------- reactions ----------------
  const applyReaction = useCallback((chatId, messageId, userId, emoji) => {
    setThreads((prev) => {
      const t = prev[chatId];
      if (!t) return prev;
      const items = t.items.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions ?? {}) };
        if (emoji) reactions[userId] = emoji;
        else delete reactions[userId];
        return { ...m, reactions };
      });
      return { ...prev, [chatId]: { ...t, items } };
    });
  }, []);

  /** Tap an emoji: set it, or remove it if it's already my reaction. */
  const toggleReaction = useCallback(
    async (chatId, message, emoji) => {
      const before = message.reactions?.[myId] ?? null;
      const next = before === emoji ? null : emoji;
      applyReaction(chatId, message.id, myId, next);
      try {
        await api.setReaction(message.id, next);
      } catch (e) {
        applyReaction(chatId, message.id, myId, before);
        fail(e, "Couldn't react");
      }
    },
    [myId, applyReaction, fail],
  );

  // ---------------- sending ----------------
  const send = useCallback(
    async (chatId, draft, file) => {
      const id = uuid();
      const optimistic = { id, chatId, senderId: myId, sentByMe: true, timestamp: Date.now(), pending: true, ...draft };
      upsertMessages(chatId, [optimistic]);
      patchChat(chatId, { lastMessage: optimistic, lastMessageAt: optimistic.timestamp });
      try {
        const filePath = file ? await api.uploadChatFile(chatId, id, file, draft.fileName) : null;
        const row = await api.insertMessage({
          id,
          chat_id: chatId,
          sender_id: myId,
          type: draft.type,
          body: draft.text ?? draft.caption ?? null,
          file_path: filePath,
          file_name: draft.fileName ?? null,
          file_size: draft.fileSize ?? null,
          mime_type: draft.mimeType ?? null,
          duration: draft.duration ?? null,
          reply_to: draft.replyTo ?? null,
        });
        upsertMessages(chatId, [{ ...api.toUiMessage(row, myId), pending: false }]);
      } catch (e) {
        upsertMessages(chatId, [{ ...optimistic, pending: false, failed: true }]);
        fail(e, "Message not sent");
      }
    },
    [myId, upsertMessages, fail],
  );

  const sendText = (chatId, text, replyTo) => send(chatId, { type: "text", text, replyTo });

  const sendAudio = (chatId, { blob, url, duration }, replyTo) => {
    const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
    return send(chatId, { type: "audio", localUrl: url, duration, fileName: file.name, fileSize: file.size, mimeType: file.type, replyTo }, file);
  };

  const sendFiles = (chatId, files, caption, replyTo) =>
    Promise.all(
      files.map((f, i) =>
        send(
          chatId,
          {
            type: f.type.startsWith("image/") ? "image" : "file",
            localUrl: URL.createObjectURL(f),
            fileName: f.name,
            fileSize: f.size,
            mimeType: f.type,
            caption: i === files.length - 1 && caption ? caption : undefined,
            replyTo: i === 0 ? replyTo : undefined,
          },
          f,
        ),
      ),
    );

  // ---------------- chat actions ----------------
  const startChatWith = useCallback(
    async (userId) => {
      try {
        const chatId = await api.getOrCreateDirectChat(userId);
        if (!chatsRef.current.some((c) => c.id === chatId)) await loadChats();
        return chatId;
      } catch (e) {
        fail(e, "Couldn't open chat");
        return null;
      }
    },
    [loadChats, fail],
  );

  const run = (fn, msg) => fn().catch((e) => fail(e, msg));

  const togglePin = (chat) => {
    patchChat(chat.id, { pinned: !chat.pinned });
    run(() => api.setPinned(chat.id, myId, !chat.pinned), "Couldn't pin chat");
  };
  const setPrivate = (chat, value) => {
    patchChat(chat.id, { privateMode: value });
    run(() => api.setPrivateMode(chat.id, value), "Couldn't change private mode");
  };
  const toggleBlock = (chat) => {
    patchChat(chat.id, { blocked: !chat.blocked });
    run(() => (chat.blocked ? api.unblockUser(myId, chat.userId) : api.blockUser(myId, chat.userId)), "Couldn't update block");
  };
  const toggleMute = (chat) => {
    patchChat(chat.id, { muted: !chat.muted });
    run(() => api.setMuted(chat.id, myId, !chat.muted), "Couldn't change notifications");
  };

  // ---------- groups ----------
  const createGroup = async (title, memberIds) => {
    try {
      const chatId = await api.createGroup(title, memberIds);
      await loadChats();
      return chatId;
    } catch (e) {
      fail(e, "Couldn't create the group");
      return null;
    }
  };
  const addMembers = async (chatId, ids) => {
    await api.addGroupMembers(chatId, ids); // errors shown by the caller
    await loadChats();
  };
  const removeMember = (chatId, userId) =>
    run(async () => {
      await api.removeGroupMember(chatId, userId);
      await loadChats();
    }, "Couldn't remove member");
  const renameGroup = async (chatId, title) => {
    await api.renameGroup(chatId, title);
    patchChat(chatId, { title });
  };
  const leaveGroup = async (chatId) => {
    setChats((list) => list.filter((c) => c.id !== chatId));
    await run(() => api.leaveGroup(chatId), "Couldn't leave the group");
  };

  const deleteChat = async (chatId) => {
    setChats((list) => list.filter((c) => c.id !== chatId));
    setThreads((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
    await run(() => api.clearChat(chatId), "Couldn't delete chat");
  };

  // ---------------- realtime: messages, reactions, chat settings ----------------
  const subscribedOnce = useRef(false);
  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`db-${myId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => {
        const msg = api.toUiMessage(row, myId);
        const known = chatsRef.current.some((c) => c.id === row.chat_id);
        if (!known) return void loadChats(); // new conversation / added to a group
        upsertMessages(row.chat_id, [{ ...msg, pending: false }]);
        if (msg.type === "system") loadChats(); // members or title changed
        else ensurePeople([row.sender_id]);
        const counts = !msg.sentByMe && msg.type !== "system";
        // soft ping while the app is on screen (when it's closed, push notifications take over)
        const chatMuted = chatsRef.current.find((c) => c.id === row.chat_id)?.muted;
        if (counts && !chatMuted && document.visibilityState === "visible") playMessagePing();
        const isActive = activeIdRef.current === row.chat_id;
        setChats((list) =>
          list.map((c) =>
            c.id === row.chat_id
              ? { ...c, lastMessage: msg, lastMessageAt: msg.timestamp, unread: counts && !isActive ? c.unread + 1 : c.unread }
              : c,
          ),
        );
        if (isActive && !msg.sentByMe) markReadIfVisible(row.chat_id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chats" }, ({ new: row }) => {
        patchChat(row.id, { privateMode: row.private_mode });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "read_receipts" }, ({ new: r }) => {
        if (r?.chat_id && r.read_at) setReceipt(r.chat_id, r.user_id, r.read_at);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, ({ new: r }) => {
        if (r?.message_id) applyReaction(r.chat_id, r.message_id, r.user_id, r.emoji);
      })
      .subscribe((status) => {
        // the connection came back after dropping (phone slept, network switched): fetch what we missed
        if (status === "SUBSCRIBED") {
          if (subscribedOnce.current) resync();
          subscribedOnce.current = true;
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, loadChats, upsertMessages, ensurePeople, applyReaction, resync, setReceipt, markReadIfVisible]);

  // ---------------- presence: who is online ----------------
  useEffect(() => {
    if (!myId) return;
    const channel = supabase.channel("online", { config: { presence: { key: myId } } });
    channel
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => status === "SUBSCRIBED" && channel.track({ at: Date.now() }));

    api.touchLastSeen(myId);
    const t = setInterval(() => api.touchLastSeen(myId), 60_000);
    const onHide = () => document.visibilityState === "hidden" && api.touchLastSeen(myId);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      supabase.removeChannel(channel);
    };
  }, [myId]);

  // people with a live status string
  const users = useMemo(() => {
    const out = {};
    for (const [id, u] of Object.entries(people)) {
      const isOnline = online.has(id);
      out[id] = { ...u, online: isOnline, status: isOnline ? "online" : formatLastSeen(u.lastSeen) };
    }
    return out;
  }, [people, online]);

  // chats in the shape the UI components use
  const uiChats = useMemo(
    () =>
      chats.map((c) => {
        const t = threads[c.id];
        // read receipts of everyone else in the chat
        const others = Object.entries(receipts[c.id] ?? {})
          .filter(([uid]) => uid !== myId)
          .map(([, at]) => at);
        const withSeen = (m) => {
          if (!m?.sentByMe || m.pending || m.failed) return m;
          const seenBy = others.filter((at) => at >= m.timestamp).length;
          return seenBy === (m.seenBy ?? 0) && Boolean(seenBy) === Boolean(m.read) ? m : { ...m, seenBy, read: seenBy > 0 };
        };
        const items = t?.loaded ? t.items : c.lastMessage ? [c.lastMessage] : [];
        return {
          ...c,
          lastMessage: withSeen(c.lastMessage),
          messages: items.map(withSeen),
          loadingMessages: Boolean(t?.loading),
          hasMore: t?.hasMore ?? false,
        };
      }),
    [chats, threads, receipts, myId],
  );

  // total unread messages in non-muted chats (for the app icon badge)
  const unreadMessages = useMemo(() => chats.reduce((n, c) => n + (c.muted ? 0 : c.unread || 0), 0), [chats]);

  return {
    chats: uiChats,
    unreadMessages,
    quotes,
    ensureQuotes,
    toggleReaction,
    resync,
    users,
    addPeople,
    ensurePeople,
    loadingChats,
    error,
    clearError: () => setError(null),
    fail,
    setActiveChat,
    loadOlder: (chatId) => loadMessages(chatId, { older: true }),
    sendText,
    sendAudio,
    sendFiles,
    startChatWith,
    togglePin,
    setPrivate,
    toggleBlock,
    toggleMute,
    deleteChat,
    createGroup,
    addMembers,
    removeMember,
    renameGroup,
    leaveGroup,
    reload: loadChats,
  };
};
