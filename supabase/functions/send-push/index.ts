// Supabase Edge Function: sends Web Push notifications for new messages and incoming calls.
// Called by database triggers (see migrations/20261119000100_push_webhook.sql).
//
// Secrets (`npx supabase secrets set ...`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com), PUSH_WEBHOOK_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@example.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

type Payload = {
  title: string;
  body: string;
  tag: string;
  url: string;
  kind: "message" | "call";
  icon?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const preview = (m: { type: string; body: string | null; file_name: string | null }) => {
  if (m.type === "image") return "📷 Photo" + (m.body ? ` · ${m.body}` : "");
  if (m.type === "audio") return "🎤 Voice message";
  if (m.type === "video") return "⭕ Video message";
  if (m.type === "file") return `📎 ${m.file_name ?? "File"}`;
  const t = (m.body ?? "").replace(/\s+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 137) + "…" : t;
};

async function sendToUsers(userIds: string[], payload: Payload, ttl: number) {
  if (!userIds.length) return { sent: 0, removed: 0 };
  const { data: subs, error } = await admin.from("push_subscriptions").select("*").in("user_id", userIds);
  if (error) throw error;
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: ttl, urgency: "high", topic: payload.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "") },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // subscription expired / unsubscribed
        else console.error("push failed", code, (e as Error).message);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length };
}

async function onMessage(id: string) {
  // Re-read from the database: never trust the request body.
  const { data: m } = await admin.from("messages").select("*").eq("id", id).maybeSingle();
  if (!m || m.type === "system") return { skipped: "system or missing" };
  if (Date.now() - Date.parse(m.created_at) > 5 * 60_000) return { skipped: "old" };

  const [{ data: chat }, { data: sender }, { data: members }] = await Promise.all([
    admin.from("chats").select("id, is_group, title, private_mode, avatar_url").eq("id", m.chat_id).single(),
    admin.from("profiles").select("name, avatar_url").eq("id", m.sender_id).single(),
    admin.from("chat_members").select("user_id, muted").eq("chat_id", m.chat_id),
  ]);
  const recipients = (members ?? []).filter((x) => x.user_id !== m.sender_id && !x.muted).map((x) => x.user_id);

  const who = sender?.name ?? "Someone";
  const text = chat?.private_mode ? "New message" : preview(m);
  return sendToUsers(
    recipients,
    {
      kind: "message",
      title: chat?.is_group ? chat.title : who,
      body: chat?.is_group ? `${who}: ${text}` : text,
      tag: `chat-${m.chat_id}`,
      url: `/?chat=${m.chat_id}`,
      // groups show the group photo (if set), 1:1 chats show the sender's photo
      icon: (chat?.is_group ? chat.avatar_url ?? sender?.avatar_url : sender?.avatar_url) ?? undefined,
    },
    60 * 60 * 24,
  );
}

async function onCall(id: string) {
  const { data: c } = await admin.from("calls").select("*").eq("id", id).maybeSingle();
  if (!c || c.status !== "ringing") return { skipped: "not ringing" };

  const [{ data: chat }, { data: caller }, { data: members }] = await Promise.all([
    admin.from("chats").select("id, is_group, title, avatar_url").eq("id", c.chat_id).single(),
    admin.from("profiles").select("name, avatar_url").eq("id", c.caller_id).single(),
    admin.from("chat_members").select("user_id, muted").eq("chat_id", c.chat_id),
  ]);
  // 1:1 calls always ring; group calls skip people who muted the group
  const targets = c.is_group
    ? (members ?? []).filter((x) => x.user_id !== c.caller_id && !x.muted).map((x) => x.user_id)
    : [c.callee_id];
  const kind = c.video ? "video" : "voice";
  const who = caller?.name ?? "Someone";

  return sendToUsers(
    targets,
    {
      kind: "call",
      title: c.is_group ? chat?.title ?? "Group call" : who,
      body: c.is_group ? `${who} started a ${kind} call — tap to join` : `Incoming ${kind} call`,
      tag: `call-${c.id}`,
      url: `/?call=${c.id}`,
      icon: (c.is_group ? chat?.avatar_url ?? caller?.avatar_url : caller?.avatar_url) ?? undefined,
    },
    45, // a call notification is useless after it stops ringing
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = env("PUSH_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return json({ error: "Unauthorized" }, 401);
  if (!env("VAPID_PUBLIC_KEY") || !env("VAPID_PRIVATE_KEY")) return json({ error: "VAPID keys not configured" }, 500);

  try {
    const { table, record } = await req.json();
    if (!record?.id) return json({ error: "Bad payload" }, 400);
    if (table === "messages") return json(await onMessage(record.id));
    if (table === "calls") return json(await onCall(record.id));
    return json({ skipped: "table" });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
