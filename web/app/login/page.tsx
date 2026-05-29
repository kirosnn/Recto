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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs flex flex-col gap-8">
        <div className="text-center">
          <p className="text-white/30 text-sm mt-1">Connecte-toi pour continuer</p>
        </div>

        <div className="flex flex-col gap-4">
          <LoginButton next={next} />
          <p className="text-xs text-white/15 text-center leading-relaxed">
            Seul ton pseudo et identifiant Discord sont utilisés.
          </p>
        </div>
      </div>
    </div>
  );
}
