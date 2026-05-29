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
    <div className="main-page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <h1 className="main-intro" style={{ textAlign: "left", marginTop: 0 }}>
          Bienvenue.
        </h1>

        <p className="main-body" style={{ textAlign: "left", marginTop: "12px", width: "100%" }}>
          Connecte-toi avec Discord pour accéder à Recto et Verso.
        </p>

        <div style={{ marginTop: "28px" }}>
          <LoginButton next={next} />
        </div>

        <p style={{
          marginTop: "16px", fontSize: "0.82rem",
          color: "#a39589", lineHeight: 1.6, textAlign: "center",
        }}>
          Seul ton pseudo et identifiant Discord sont utilisés.
        </p>
      </div>
    </div>
  );
}
