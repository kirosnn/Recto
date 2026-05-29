import type { User } from "@supabase/supabase-js";

export type Identity = { name: string; avatar: string | null };

// Extract a display name + avatar from a Discord-authenticated Supabase user.
export function identityFromUser(user: User | null): Identity {
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    custom_claims?: { global_name?: string };
    avatar_url?: string;
  };
  const name =
    meta.full_name ||
    meta.custom_claims?.global_name ||
    meta.name ||
    user?.email?.split("@")[0] ||
    "Utilisateur";
  return { name, avatar: meta.avatar_url ?? null };
}
