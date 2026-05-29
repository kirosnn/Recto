import { createClient } from "../../lib/supabase-server";
import { redirect } from "next/navigation";
import UserMenu from "../../components/UserMenu";
import ThemeToggle from "../../components/ThemeToggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        gap: "6px", padding: "0 clamp(16px, 3vw, 32px)", height: "52px",
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      }}>
        <ThemeToggle />
        <UserMenu user={user as Parameters<typeof UserMenu>[0]["user"]} />
      </nav>
      <div style={{ flex: 1, paddingTop: "52px" }}>{children}</div>
    </div>
  );
}
