import { createClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import UserMenu from "../../components/UserMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="flex items-center justify-between px-6 h-14 border-b border-white/5 bg-zinc-950/80 backdrop-blur shrink-0">
        <Link href="/" className="font-bold tracking-wide text-white">
          Recto
        </Link>
        <UserMenu user={user as Parameters<typeof UserMenu>[0]["user"]} />
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  );
}
