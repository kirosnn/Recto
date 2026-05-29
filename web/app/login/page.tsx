import { createClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";
import LoginButton from "./LoginButton";
import ThemeToggle from "../../components/ThemeToggle";

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
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="flex justify-end px-6 pt-4">
        <ThemeToggle />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs flex flex-col gap-6">
          <p className="text-txm text-sm text-center">Connecte-toi pour continuer</p>
          <LoginButton next={next} />
          <p className="text-xs text-txm/50 text-center leading-relaxed">
            Seul ton pseudo et identifiant Discord sont utilisés.
          </p>
        </div>
      </div>
    </div>
  );
}
