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
    <div
      className="site-shell recto-form-page"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
    >
      <div className="site-content site-form-content recto-form-inner">
        <h1 className="site-title">
          Bienvenue.
        </h1>

        <p className="site-text">
          Connecte-toi avec Discord pour accéder à Recto et Verso.
        </p>

        <div style={{ marginTop: "28px" }}>
          <LoginButton next={next} />
        </div>

        <p className="site-muted" style={{ marginTop: "16px", fontSize: "0.82rem", lineHeight: 1.6, textAlign: "center" }}>
          Seul ton pseudo et identifiant Discord sont utilisés.
        </p>
      </div>
    </div>
  );
}
