// All Supabase calls the app makes, in one place.
import { supabase } from "./supabase";

const CHAT_FILES = "chat-files";
const AVATARS = "avatars";
export const PAGE_SIZE = 50;

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ---------- mapping DB rows -> UI shapes ----------

export const toUiUser = (p) =>
  p && {
    id: p.id,
    name: p.name,
    username: `@${p.username}`,
    avatar: p.avatar_url,
    lastSeen: p.last_seen ? Date.parse(p.last_seen) : null,
  };

export const toUiMessage = (row, myId) => ({
  id: row.id,
  chatId: row.chat_id,
  senderId: row.sender_id,
  type: row.type,
  text: row.type === "text" || row.type === "system" ? row.body : undefined,
  caption: !["text", "system"].includes(row.type) ? row.body || undefined : undefined,
  filePath: row.file_path,
  fileName: row.file_name,
  fileSize: row.file_size,
  mimeType: row.mime_type,
  duration: row.duration,
  timestamp: Date.parse(row.created_at),
  expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
  sentByMe: row.sender_id === myId,
  replyTo: row.reply_to ?? null,
  // only present when loaded with reactions; { userId: emoji }
  ...(row.message_reactions ? { reactions: reactionsMap(row.message_reactions) } : {}),
});

/** [{ user_id, emoji }] -> { userId: emoji } (removed reactions have emoji = null) */
export const reactionsMap = (rows) => {
  const out = {};
  for (const r of rows ?? []) if (r.emoji) out[r.user_id] = r.emoji;
  return out;
};

const FINAL = ["ended", "missed", "declined", "cancelled"];

export const toUiCall = (row, myId) => {
  const outgoing = row.caller_id === myId;
  const parts = row.call_participants ?? [];
  const iJoined = parts.some((p) => p.user_id === myId);
  const answered = row.answered_at && row.ended_at;
  const missed = row.is_group
    ? !outgoing && !iJoined && FINAL.includes(row.status)
    : ["missed", "declined", "cancelled"].includes(row.status);
  return {
    id: row.id,
    chatId: row.chat_id,
    isGroup: row.is_group,
    userId: row.is_group ? null : outgoing ? row.callee_id : row.caller_id,
    callerId: row.caller_id,
    direction: outgoing ? "outgoing" : "incoming",
    status: row.status,
    video: row.video,
    missed,
    inCall: parts.filter((p) => !p.left_at).map((p) => p.user_id),
    duration: answered ? Math.max(0, Math.round((Date.parse(row.ended_at) - Date.parse(row.answered_at)) / 1000)) : 0,
    timestamp: Date.parse(row.created_at),
  };
};

// ---------- chats ----------

export const fetchChats = async () => must(await supabase.rpc("my_chats"));

export const getOrCreateDirectChat = async (otherUserId) =>
  must(await supabase.rpc("get_or_create_direct_chat", { p_other: otherUserId }));

export const markChatRead = (chatId) => supabase.rpc("mark_chat_read", { p_chat: chatId });

/** Who has read up to when, in these chats: [{ chat_id, user_id, read_at }] */
export const fetchReadReceipts = async (chatIds) =>
  chatIds.length
    ? must(await supabase.from("read_receipts").select("chat_id, user_id, read_at").in("chat_id", chatIds))
    : [];

export const clearChat = async (chatId) => must(await supabase.rpc("clear_chat", { p_chat: chatId }));

export const setPinned = async (chatId, userId, pinned) =>
  must(await supabase.from("chat_members").update({ pinned }).eq("chat_id", chatId).eq("user_id", userId));

export const setMuted = async (chatId, userId, muted) =>
  must(await supabase.from("chat_members").update({ muted }).eq("chat_id", chatId).eq("user_id", userId));

// ---------- groups ----------

export const createGroup = async (title, memberIds) =>
  must(await supabase.rpc("create_group", { p_title: title, p_members: memberIds }));

export const addGroupMembers = async (chatId, memberIds) =>
  must(await supabase.rpc("add_group_members", { p_chat: chatId, p_members: memberIds }));

export const removeGroupMember = async (chatId, userId) =>
  must(await supabase.rpc("remove_group_member", { p_chat: chatId, p_user: userId }));

export const leaveGroup = async (chatId) => must(await supabase.rpc("leave_group", { p_chat: chatId }));

export const renameGroup = async (chatId, title) =>
  must(await supabase.rpc("rename_group", { p_chat: chatId, p_title: title }));

export const GROUP_LIMIT = 5;

export const setPrivateMode = async (chatId, privateMode) =>
  must(await supabase.from("chats").update({ private_mode: privateMode }).eq("id", chatId));

export const blockUser = async (me, other) =>
  must(await supabase.from("blocks").insert({ blocker_id: me, blocked_id: other }));

export const unblockUser = async (me, other) =>
  must(await supabase.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", other));

// ---------- messages ----------

/** Newest PAGE_SIZE messages before `before` (ISO string), returned oldest-first. */
const MESSAGE_SELECT = "*, message_reactions(user_id, emoji)";

export const fetchMessages = async (chatId, before) => {
  let q = supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt("created_at", before);
  return must(await q).reverse();
};

/** Messages newer than `after` (ISO), oldest first — used to catch up after the connection dropped. */
export const fetchMessagesAfter = async (chatId, after) =>
  must(
    await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("chat_id", chatId)
      .gt("created_at", after)
      .order("created_at", { ascending: true })
      .limit(200),
  );

/** Specific messages (e.g. the original of a reply that isn't loaded yet). */
export const fetchMessagesByIds = async (ids) =>
  ids.length ? must(await supabase.from("messages").select("*").in("id", ids)) : [];

/** Set, change or remove (emoji = null) my reaction to a message. */
export const setReaction = async (messageId, emoji) =>
  must(await supabase.rpc("set_reaction", { p_message: messageId, p_emoji: emoji }));

export const insertMessage = async (row) => must(await supabase.from("messages").insert(row).select().single());

const safeName = (name) => name.replace(/[^\w.-]+/g, "_").slice(-80);

export const uploadChatFile = async (chatId, messageId, file, name = file.name) => {
  const path = `${chatId}/${messageId}-${safeName(name)}`;
  must(await supabase.storage.from(CHAT_FILES).upload(path, file, { contentType: file.type || undefined, upsert: false }));
  return path;
};

export const signFileUrl = async (path) =>
  must(await supabase.storage.from(CHAT_FILES).createSignedUrl(path, 60 * 60)).signedUrl;

// ---------- people ----------

export const searchProfiles = async (query, myId) => {
  const q = query.trim().replace(/^@/, "").replace(/[%_,()*\\]/g, "");
  if (!q) return [];
  return must(
    await supabase
      .from("profiles")
      .select("*")
      .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
      .neq("id", myId)
      .order("name")
      .limit(25),
  );
};

export const fetchProfiles = async (ids) =>
  ids.length ? must(await supabase.from("profiles").select("*").in("id", ids)) : [];

export const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export const updateMyProfile = async (userId, patch) => {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (!error) return;
  if (error.code === "23505") throw new Error("That username is already taken.");
  if (error.code === "23514") throw new Error("Usernames are 3–32 characters: letters, numbers or _.");
  throw error;
};

/** true if the username is valid and free (your own current username counts as free). */
export const isUsernameAvailable = async (username) =>
  must(await supabase.rpc("username_available", { p_username: username }));

export const touchLastSeen = (userId) =>
  supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", userId);

/** Center-crops an image to a square and scales it to 512px, so avatars are small and consistent. */
const squareAvatar = (file, size = 512) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(size, side);
      canvas
        .getContext("2d")
        .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process image"))), "image/jpeg", 0.9);
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("That file isn't a supported image."));
    };
    img.src = src;
  });

/** Storage path of an avatar from its public URL (to delete the old one). */
const avatarPathFromUrl = (url) => {
  const marker = `/storage/v1/object/public/${AVATARS}/`;
  const i = url?.indexOf(marker) ?? -1;
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0]) : null;
};

/** Uploads a new avatar, saves it on the profile and removes the previous file. Returns the new URL. */
export const setAvatar = async (userId, file, previousUrl) => {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image.");
  const blob = await squareAvatar(file);
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  must(await supabase.storage.from(AVATARS).upload(path, blob, { contentType: "image/jpeg", upsert: false })); // unique name, no overwrite needed
  const url = supabase.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
  await updateMyProfile(userId, { avatar_url: url });
  const oldPath = avatarPathFromUrl(previousUrl);
  if (oldPath) supabase.storage.from(AVATARS).remove([oldPath]); // best effort
  return url;
};

/** Group photo: crop, upload to avatars/groups/<chat>/, save on the chat (adds a "changed the group photo" note). */
export const setGroupAvatar = async (chatId, file, previousUrl) => {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image.");
  const blob = await squareAvatar(file);
  const path = `groups/${chatId}/avatar-${Date.now()}.jpg`;
  must(await supabase.storage.from(AVATARS).upload(path, blob, { contentType: "image/jpeg", upsert: false }));
  const url = supabase.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
  must(await supabase.rpc("set_group_avatar", { p_chat: chatId, p_url: url }));
  const oldPath = avatarPathFromUrl(previousUrl);
  if (oldPath?.startsWith(`groups/${chatId}/`)) supabase.storage.from(AVATARS).remove([oldPath]); // best effort
  return url;
};

export const removeGroupAvatar = async (chatId, currentUrl) => {
  must(await supabase.rpc("set_group_avatar", { p_chat: chatId, p_url: null }));
  const oldPath = avatarPathFromUrl(currentUrl);
  if (oldPath?.startsWith(`groups/${chatId}/`)) await supabase.storage.from(AVATARS).remove([oldPath]);
};

/** { chatId: avatarUrl } for these group chats */
export const fetchGroupAvatars = async (chatIds) => {
  if (!chatIds.length) return {};
  const rows = must(await supabase.from("chats").select("id, avatar_url").in("id", chatIds));
  return Object.fromEntries(rows.map((r) => [r.id, r.avatar_url]));
};

export const removeAvatar = async (userId, currentUrl) => {
  await updateMyProfile(userId, { avatar_url: null });
  const oldPath = avatarPathFromUrl(currentUrl);
  if (oldPath) await supabase.storage.from(AVATARS).remove([oldPath]);
};

export const changePassword = async (email, oldPassword, newPassword) => {
  const check = await supabase.auth.signInWithPassword({ email, password: oldPassword });
  if (check.error) throw new Error("Current password is incorrect.");
  must(await supabase.auth.updateUser({ password: newPassword }));
};

// ---------- calls ----------

export const CALL_SELECT = "*, call_participants(user_id, left_at)";

export const fetchCalls = async () =>
  must(await supabase.from("calls").select(CALL_SELECT).order("created_at", { ascending: false }).limit(100));

export const fetchCall = async (id) => must(await supabase.from("calls").select(CALL_SELECT).eq("id", id).maybeSingle());

export const joinCall = async (id) => must(await supabase.rpc("join_call", { p_call: id }));

export const leaveCall = (id) => supabase.rpc("leave_call", { p_call: id });

export const createCall = async (row) => must(await supabase.from("calls").insert(row).select(CALL_SELECT).single());

export const updateCall = (id, patch) => supabase.from("calls").update(patch).eq("id", id);

export const getLivekitToken = async (callId) => {
  const { data, error } = await supabase.functions.invoke("livekit-token", { body: { callId } });
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context.json()).error ?? msg;
    } catch {
      /* keep default message */
    }
    throw new Error(msg);
  }
  return data;
};
