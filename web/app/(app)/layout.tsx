import { createClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";
import UserMenu from "../../components/UserMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-col min-h-screen bg-black">
      <nav className="flex items-center justify-end px-6 h-14 shrink-0">
        <UserMenu user={user as Parameters<typeof UserMenu>[0]["user"]} />
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  );
}
