import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

type AuthCtx = { user: User | null; loading: boolean; signOut: () => Promise<void> };

const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

export function useAuth() { return useContext(Ctx); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore existing session
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Handle deep link OAuth callback: recto://auth/callback?code=...
    const unlisten = onOpenUrl(async (urls) => {
      const url = urls[0];
      if (!url) return;
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data.user) setUser(data.user);
        }
      } catch {}
    });

    return () => {
      subscription.unsubscribe();
      unlisten.then((fn) => fn());
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signOut }}>{children}</Ctx.Provider>;
}
