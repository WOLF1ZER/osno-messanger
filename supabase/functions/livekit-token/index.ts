// Supabase Edge Function: issues a LiveKit access token for a call.
// The caller must be signed in and be one of the two people in that call.
//
// Secrets (Dashboard -> Edge Functions -> Secrets, or `supabase secrets set`):
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!apiKey || !apiSecret) return json({ error: "LiveKit is not configured on the server" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in" }, 401);

  // Client that acts as the signed-in user, so Row Level Security applies.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
  const user = userData.user;

  let callId: string | undefined;
  try {
    ({ callId } = await req.json());
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  if (!callId) return json({ error: "callId is required" }, 400);

  // RLS only returns calls this user is part of.
  const { data: call, error: callError } = await supabase
    .from("calls")
    .select("id, status, caller_id, callee_id")
    .eq("id", callId)
    .maybeSingle();
  if (callError || !call) return json({ error: "Call not found" }, 404);
  if (!["ringing", "active"].includes(call.status)) return json({ error: "Call is over" }, 409);

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.name ?? user.email ?? "OSNO user",
    ttl: 60 * 60, // 1 hour
  });
  token.addGrant({
    room: `call-${call.id}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return json({ token: await token.toJwt(), room: `call-${call.id}` });
});
