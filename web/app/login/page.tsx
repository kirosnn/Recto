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
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 20px" }}>
        <ThemeToggle />
      </div>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "clamp(24px, 5vw, 48px)",
      }}>
        <div style={{ width: "100%", maxWidth: "340px" }}>
          <h1 className="serif" style={{
            fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
            letterSpacing: "-0.03em", color: "var(--tx)",
            marginBottom: "8px", lineHeight: 1.1,
          }}>
            Bienvenue.
          </h1>
          <p style={{
            fontSize: "0.92rem", color: "var(--tx-2)",
            marginBottom: "32px", lineHeight: 1.55,
          }}>
            Connecte-toi avec Discord pour accéder à Recto.
          </p>

          <LoginButton next={next} />

          <p style={{
            marginTop: "20px", fontSize: "0.78rem",
            color: "var(--tx-3)", lineHeight: 1.6,
            textAlign: "center",
          }}>
            Seul ton pseudo et identifiant Discord sont utilisés.
            Aucun mot de passe stocké.
          </p>
        </div>
      </div>
    </div>
  );
}
