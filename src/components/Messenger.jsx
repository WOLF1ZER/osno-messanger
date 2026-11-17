import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { IoClose } from "react-icons/io5";
import { FiBell } from "react-icons/fi";
import { NavRail, MobileTabBar } from "./chat/Navigation";
import ChatList from "./chat/ChatList";
import Conversation from "./chat/Conversation";
import ContactInfo from "./chat/ContactInfo";
import GroupInfo from "./chat/GroupInfo";
import Profile from "./chat/Profile";
import NewChat from "./chat/NewChat";
import Calls from "./chat/Calls";
import { LogoMark, Wordmark } from "./ui/Logo";
import { useAuth } from "../lib/AuthContext";
import { useMessenger } from "../lib/useMessenger";
import { useCalls } from "../lib/useCalls";
import { enablePush, forgetPushOnLogout, getPushState, refreshPushSubscription } from "../lib/push";
import * as api from "../lib/api";
import { unlockAudio } from "../lib/sounds";

// LiveKit is large: load the call screen only when a call happens.
const CallScreen = lazy(() => import("./chat/CallScreen"));

const BANNER_KEY = "osno:push-banner-dismissed";

/** "Turn on notifications" banner shown once at the top of the chat list. */
const PushBanner = () => {
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(BANNER_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!dismissed) getPushState().then((s) => setShow(s === "disabled")).catch(() => {});
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  if (!show) return null;
  return (
    <div className="mx-5 mb-4 glass p-4 animate-fade-up">
      <div className="flex items-start gap-3">
        <FiBell className="text-white mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white">Turn on notifications</p>
          <p className="text-xs text-ink-400 mt-0.5">Get messages and calls even when OSNO is closed.</p>
          {error && <p className="text-xs text-ink-200 mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={async () => {
                try {
                  await enablePush();
                  dismiss();
                } catch (e) {
                  setError(e.message);
                }
              }}
              className="h-8 px-4 rounded-full bg-white text-black text-xs font-display uppercase tracking-wider2 font-semibold"
            >
              Enable
            </button>
            <button onClick={dismiss} className="h-8 px-3 text-xs text-ink-400 hover:text-white">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * App shell, backed by Supabase (data, realtime, storage) and LiveKit (calls).
 *
 * Layout
 *  - phone:   one screen at a time, floating rounded glass tab bar (Telegram iOS style)
 *  - tablet+: nav rail | side column (chats / calls / new chat / profile) | conversation | chat info
 */
const Messenger = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, signOut } = useAuth();

  const me = useMemo(
    () => ({
      id: user.id,
      email: user.email,
      name: profile?.name ?? user.email,
      username: profile ? `@${profile.username}` : "",
      avatar: profile?.avatar_url ?? null,
    }),
    [user, profile],
  );

  const m = useMessenger(me);
  const calls = useCalls({ me, ensurePeople: m.ensurePeople, fail: m.fail });

  const [view, setView] = useState("chats"); // chats | calls | search | profile
  const [activeId, setActiveId] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const chatsById = useMemo(() => Object.fromEntries(m.chats.map((c) => [c.id, c])), [m.chats]);
  const activeChat = chatsById[activeId] ?? null;
  const totalUnread = m.chats.reduce((n, c) => n + (c.unread && !c.muted ? 1 : 0), 0);
  const contactIds = useMemo(() => m.chats.filter((c) => !c.isGroup).map((c) => c.userId), [m.chats]);

  /** What to show for a chat: the other person, or the group as a "person". */
  const peerOf = useCallback(
    (chat) => {
      if (!chat) return null;
      if (!chat.isGroup) return m.users[chat.userId] ?? null;
      const others = chat.memberIds.filter((id) => id !== me.id);
      const online = others.filter((id) => m.users[id]?.online).length;
      return {
        id: chat.id,
        name: chat.title,
        avatar: null,
        online: false,
        isGroup: true,
        status: `${chat.memberIds.length} members${online ? `, ${online} online` : ""}`,
      };
    },
    [m.users, me.id],
  );
  const activePeer = peerOf(activeChat);
  const ensureQuotes = m.ensureQuotes;
  const onNeedQuotes = useCallback((ids) => activeId && ensureQuotes(activeId, ids), [activeId, ensureQuotes]);

  // ---------- navigation ----------
  const openChat = useCallback(
    (id) => {
      setActiveId(id);
      setInfoOpen(false);
      m.setActiveChat(id);
    },
    [m],
  );

  const closeChat = () => {
    setActiveId(null);
    m.setActiveChat(null);
  };

  const changeView = useCallback(
    (v) => {
      setView(v);
      if (v !== "chats") {
        setActiveId(null);
        m.setActiveChat(null);
      }
      setInfoOpen(false);
      if (v === "calls") calls.markSeen();
    },
    [m, calls],
  );

  const startChatWith = async (userId, knownUser) => {
    if (knownUser) m.addPeople([knownUser]);
    const chatId = await m.startChatWith(userId);
    if (!chatId) return;
    setView("chats");
    openChat(chatId);
  };

  const createGroup = async (title, ids) => {
    const chatId = await m.createGroup(title, ids);
    if (!chatId) return false;
    setView("chats");
    openChat(chatId);
    return true;
  };

  // ---------- calls ----------
  const callChat = (chat, video = false) => {
    unlockAudio(); // the tap on the call button lets the browser play call audio later
    return calls.startCall({ chatId: chat.id, peerId: chat.userId, video, isGroup: chat.isGroup });
  };
  const joinOngoing = (c) => {
    unlockAudio();
    return calls.joinOngoing(c);
  };

  const callFromHistory = async (c, video) => {
    unlockAudio();
    if (c.isGroup) return chatsById[c.chatId] && callChat(chatsById[c.chatId], video);
    const chatId = m.chats.find((x) => x.userId === c.userId)?.id ?? (await m.startChatWith(c.userId));
    if (chatId) calls.startCall({ chatId, peerId: c.userId, video });
  };

  const openFromHistory = (c) => {
    if (c.isGroup) {
      setView("chats");
      openChat(c.chatId);
    } else startChatWith(c.userId);
  };

  // ---------- account ----------
  const logout = async () => {
    await forgetPushOnLogout(); // this device stops getting this account's notifications
    await signOut();
    navigate("/login");
  };

  const saveProfile = async ({ name, username }) => {
    await api.updateMyProfile(me.id, { name, username });
    await refreshProfile();
  };
  const changeAvatar = async (file) => {
    await api.setAvatar(me.id, file, me.avatar);
    await refreshProfile();
  };
  const deleteAvatar = async () => {
    await api.removeAvatar(me.id, me.avatar);
    await refreshProfile();
  };

  // ---------- PWA / push integration ----------
  // keep this device's push subscription linked to the signed-in account
  useEffect(() => {
    refreshPushSubscription();
  }, [me.id]);

  // unread badge on the installed app icon: total unread messages (muted chats excluded),
  // refreshed whenever the counts change and when the app is put in the background
  const unreadMessages = m.unreadMessages;
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const apply = () => (unreadMessages ? navigator.setAppBadge(unreadMessages) : navigator.clearAppBadge()).catch(() => {});
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [unreadMessages]);

  // tell the service worker whether the app is really on screen (and which chat is open),
  // so it shows notifications only when they're needed
  useEffect(() => {
    const sw = () => navigator.serviceWorker?.controller;
    const beat = () =>
      sw()?.postMessage(document.visibilityState === "visible" ? { type: "foreground", chatId: activeId } : { type: "background" });
    beat();
    const t = setInterval(beat, 5000);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("pagehide", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("pagehide", beat);
    };
  }, [activeId]);

  // opening a chat removes its notifications from the phone's notification list
  useEffect(() => {
    if (activeId) navigator.serviceWorker?.controller?.postMessage({ type: "chat-opened", chatId: activeId });
  }, [activeId]);

  // deep links: /?chat=<id>, /?call=<id>, /?view=calls|search|profile (from notifications & app shortcuts)
  const pendingLink = useRef(null);
  const handleLink = useCallback(
    (href) => {
      const url = new URL(href, window.location.origin);
      const chat = url.searchParams.get("chat");
      const v = url.searchParams.get("view");
      if (v && ["chats", "calls", "search", "profile"].includes(v)) changeView(v);
      if (chat) {
        if (chatsById[chat]) {
          setView("chats");
          openChat(chat);
        } else pendingLink.current = href; // chats not loaded yet
      }
      // ?call= : the ringing call is picked up by useCalls on load / via realtime
    },
    [chatsById, changeView, openChat],
  );

  useEffect(() => {
    if (window.location.search) {
      handleLink(window.location.href);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingLink.current && !m.loadingChats) {
      const href = pendingLink.current;
      pendingLink.current = null;
      handleLink(href);
    }
  }, [m.loadingChats, m.chats, handleLink]);

  // messages from the service worker (notification tapped while the app is open)
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const onMsg = (e) => {
      if (e.data?.type === "open" && e.data.url) handleLink(e.data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [handleLink]);

  // ---------- panels ----------
  const sidePanel = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        className="h-full"
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.18 }}
      >
        {view === "chats" && (
          <ChatList
            chats={m.chats}
            users={m.users}
            peerOf={peerOf}
            activeChatId={activeId}
            onOpen={openChat}
            onNewChat={() => changeView("search")}
            loading={m.loadingChats}
            banner={<PushBanner />}
          />
        )}
        {view === "calls" && (
          <Calls
            calls={calls.calls}
            users={m.users}
            chatsById={chatsById}
            onCall={callFromHistory}
            onOpenChat={openFromHistory}
            onJoin={joinOngoing}
          />
        )}
        {view === "search" && (
          <NewChat
            me={me}
            users={m.users}
            chats={m.chats}
            onStart={startChatWith}
            onCreateGroup={createGroup}
            addPeople={m.addPeople}
          />
        )}
        {view === "profile" && (
          <Profile
            key={me.id}
            me={me}
            onSave={saveProfile}
            onAvatarChange={changeAvatar}
            onAvatarRemove={deleteAvatar}
            onChangePassword={(oldPw, newPw) => api.changePassword(me.email, oldPw, newPw)}
            onLogout={logout}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );

  const conversation = activeChat && activePeer && (
    <Conversation
      key={activeChat.id}
      chat={activeChat}
      user={activePeer}
      users={m.users}
      myId={me.id}
      quotes={m.quotes}
      onNeedQuotes={onNeedQuotes}
      onReact={(message, emoji) => m.toggleReaction(activeChat.id, message, emoji)}
      ongoingCall={calls.ongoingByChat[activeChat.id]}
      onJoinCall={joinOngoing}
      onBack={closeChat}
      onShowInfo={() => setInfoOpen((v) => !v)}
      onCall={(video) => callChat(activeChat, video)}
      onSendText={(text, replyTo) => m.sendText(activeChat.id, text, replyTo)}
      onSendAudio={(audio, replyTo) => m.sendAudio(activeChat.id, audio, replyTo)}
      onSendFiles={(files, caption, replyTo) => m.sendFiles(activeChat.id, files, caption, replyTo)}
      onUnblock={() => m.toggleBlock(activeChat)}
      onLoadOlder={() => m.loadOlder(activeChat.id)}
    />
  );

  const infoPanel =
    activeChat &&
    activePeer &&
    (activeChat.isGroup ? (
      <GroupInfo
        key={activeChat.id}
        chat={activeChat}
        me={me}
        users={m.users}
        contactIds={contactIds}
        addPeople={m.addPeople}
        onClose={() => setInfoOpen(false)}
        onCall={(video) => callChat(activeChat, video)}
        onTogglePin={() => m.togglePin(activeChat)}
        onToggleMute={() => m.toggleMute(activeChat)}
        onTogglePrivate={(v) => m.setPrivate(activeChat, v)}
        onRename={(title) => m.renameGroup(activeChat.id, title)}
        onAddMembers={(ids) => m.addMembers(activeChat.id, ids)}
        onRemoveMember={(uid) => m.removeMember(activeChat.id, uid)}
        onOpenDirect={(uid) => startChatWith(uid)}
        onLeave={async () => {
          const id = activeChat.id;
          closeChat();
          setInfoOpen(false);
          await m.leaveGroup(id);
        }}
      />
    ) : (
      <ContactInfo
        chat={activeChat}
        user={activePeer}
        onClose={() => setInfoOpen(false)}
        onCall={(video) => callChat(activeChat, video)}
        onTogglePin={() => m.togglePin(activeChat)}
        onToggleMute={() => m.toggleMute(activeChat)}
        onToggleBlock={() => m.toggleBlock(activeChat)}
        onTogglePrivate={(v) => m.setPrivate(activeChat, v)}
        onDelete={async () => {
          const id = activeChat.id;
          closeChat();
          setInfoOpen(false);
          await m.deleteChat(id);
        }}
      />
    ));

  // the call on screen
  const call = calls.current;
  const callChatObj = call ? chatsById[call.chatId] : null;
  const callTitle = call
    ? call.isGroup
      ? callChatObj?.title ?? "Group call"
      : m.users[call.peerId]?.name ?? "Unknown"
    : "";
  const callPeople = useMemo(() => ({ ...m.users, [me.id]: me }), [m.users, me]);

  return (
    <div className="h-full w-full flex flex-col bg-space text-ink-100 overflow-hidden">
      {/* a minimized call shows its bar here (rendered by CallScreen) */}
      <div id="call-bar-slot" className="shrink-0 relative z-[60]" />
      <div className="flex-1 min-h-0 w-full flex">
      <NavRail view={view} onChange={changeView} me={me} unread={totalUnread} missed={calls.missedCount} />

      {/* Side column (tablet+) / main screen (phone when no chat open) */}
      <section
        className={`${activeChat ? "hidden md:flex" : "flex"} relative flex-col w-full md:w-[340px] lg:w-[380px] shrink-0 h-full min-h-0 overflow-hidden md:border-r border-white/10 bg-black/30`}
      >
        <div className="flex-1 min-h-0">{sidePanel}</div>
        <MobileTabBar view={view} onChange={changeView} unread={totalUnread} missed={calls.missedCount} />
      </section>

      {/* Conversation */}
      <main className={`${activeChat ? "flex" : "hidden md:flex"} flex-1 min-w-0 h-full relative`}>
        <div className="flex-1 min-w-0 h-full">
          {conversation ?? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-grid">
              <LogoMark className="w-16 opacity-80 mb-8" />
              <p className="eyebrow mb-3">
                <Wordmark className="text-[11px] text-ink-300" /> · Messenger
              </p>
              <h1 className="font-display font-bold uppercase tracking-wider text-white text-4xl lg:text-5xl leading-[1.05] max-w-lg">
                Select a chat to start messaging
              </h1>
              <button onClick={() => changeView("search")} className="btn mt-10">
                Start new chat
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {infoOpen && infoPanel && (
            <motion.aside
              key="info"
              className="absolute xl:static inset-0 xl:inset-auto z-30 w-full sm:left-auto sm:w-[380px] h-full shrink-0 border-l border-white/10 bg-ink-900 sm:bg-ink-900/90 xl:bg-black/40 backdrop-blur-2xl"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {infoPanel}
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* Error toast */}
      <AnimatePresence>
        {m.error && (
          <motion.div
            className="fixed top-[calc(env(safe-area-inset-top)+1rem)] left-1/2 -translate-x-1/2 z-[300] glass-strong flex items-center gap-3 pl-4 pr-2 py-2 max-w-[90vw]"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            role="alert"
          >
            <span className="text-sm text-white">{m.error}</span>
            <button onClick={m.clearError} className="icon-btn w-8 h-8" aria-label="Dismiss">
              <IoClose size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {call && (
          <Suspense fallback={<div className="fixed inset-0 z-[200] bg-black" />}>
            <CallScreen
              key={call.id}
              call={call}
              title={callTitle}
              avatarUser={call.isGroup ? null : m.users[call.peerId]}
              people={callPeople}
              onAccept={calls.accept}
              onDecline={calls.decline}
              onHangUp={calls.hangUp}
              onOpenChat={(chatId) => {
                setView("chats");
                openChat(chatId);
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};

export default Messenger;
