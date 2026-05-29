import { createClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";
import PreferencesDrawer from "../../components/PreferencesDrawer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ minHeight: "100vh" }}>
      {children}
      <PreferencesDrawer user={user as Parameters<typeof PreferencesDrawer>[0]["user"]} />
    </div>
  );
}
