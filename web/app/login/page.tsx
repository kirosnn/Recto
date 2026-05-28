import { createClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";
import LoginButton from "./LoginButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { next } = await searchParams;

  if (user) redirect(next ?? "/verso");

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 gap-8">
      <div className="flex flex-col items-center gap-2">
        <span className="font-bold text-white text-2xl tracking-wide">Recto</span>
        <p className="text-zinc-500 text-sm">Connecte-toi pour continuer</p>
      </div>

      <div className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="font-semibold text-lg text-white mb-1">Connexion</h1>
          <p className="text-zinc-500 text-sm">
            Un compte Discord suffit — aucun mot de passe.
          </p>
        </div>

        <LoginButton next={next} />

        <p className="text-xs text-zinc-700 text-center leading-relaxed">
          En te connectant, tu acceptes que Recto accède à ton identifiant
          et pseudo Discord uniquement.
        </p>
      </div>
    </div>
  );
}
