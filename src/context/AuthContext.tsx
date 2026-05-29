import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type AuthCtx = { user: User | null; loading: boolean; signOut: () => Promise<void> };

export const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

function isInvalidStoredSession(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const authError = error as { message?: unknown; status?: unknown };
  const message = typeof authError.message === "string" ? authError.message.toLowerCase() : "";
  const status = typeof authError.status === "number" ? authError.status : undefined;

  return message.includes("refresh token") || message.includes("invalid refresh");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const handleAuthUrl = async (url: string) => {
      try {
        const parsed = new URL(url);
        const hashParams = new URLSearchParams(parsed.hash.slice(1));
        const code = parsed.searchParams.get("code") ?? hashParams.get("code");
        const accessToken = parsed.searchParams.get("access_token") ?? hashParams.get("access_token");
        const refreshToken = parsed.searchParams.get("refresh_token") ?? hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error && active) {
            setUser(data.user ?? null);
            if (data.user) window.location.replace("/");
          }

          return;
        }

        if (!code) return;

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && active) {
          setUser(data.user ?? null);
          if (data.user) window.location.replace("/");
        }
      } catch {}
    };

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        if (isInvalidStoredSession(error)) {
          await supabase.auth.signOut({ scope: "local" });
        }

        setUser(null);
        setLoading(false);
        return;
      }

      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    getCurrent()
      .then((urls) => {
        urls?.forEach((url) => {
          void handleAuthUrl(url);
        });
      })
      .catch(() => {});

    invoke<string[]>("get_auth_deep_links")
      .then((urls) => {
        urls.forEach((url) => {
          void handleAuthUrl(url);
        });
      })
      .catch(() => {});

    const unlisten = onOpenUrl(async (urls) => {
      await Promise.all(urls.map(handleAuthUrl));
    });

    const unlistenAuthDeepLink = listen<string>("auth-deep-link", (event) => {
      void handleAuthUrl(event.payload);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      unlisten.then((fn) => fn());
      unlistenAuthDeepLink.then((fn) => fn());
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signOut }}>{children}</Ctx.Provider>;
}
