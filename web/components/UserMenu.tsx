"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase-browser";
import { useRouter } from "next/navigation";

type User = {
  user_metadata: { full_name?: string; avatar_url?: string; custom_claims?: { global_name?: string } };
  email?: string;
};

export default function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.custom_claims?.global_name ||
    user.email?.split("@")[0] ||
    "Utilisateur";

  const avatar = user.user_metadata?.avatar_url;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface transition-colors"
      >
        {avatar ? (
          <img src={avatar} alt={name} className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
            {name[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm text-tx hidden sm:block">{name}</span>
        <span className="text-txm text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl bg-surface border border-border shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs text-txm truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-accent/8 transition-colors"
            >
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
