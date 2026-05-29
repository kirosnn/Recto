import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createBrowserClient(url, key);
  return _client;
}
