import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until .env.local has the Supabase keys — the app shows a setup screen instead of crashing. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes("YOUR-PROJECT"));

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL;
