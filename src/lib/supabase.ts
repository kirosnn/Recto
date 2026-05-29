import { createClient } from "@supabase/supabase-js";
import { authStorage } from "./authStorage";

const url = import.meta.env.VITE_SUPABASE_URL as string;
// Support new publishable key (sb_publishable_xxx) with fallback to legacy anon key
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
    persistSession: true,
    storage: authStorage,
  },
});

export type Session = {
  id: string;
  code: string;
  host_id: string | null;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  status: "waiting" | "connected" | "ended";
  created_at: string;
  expires_at: string;
};
