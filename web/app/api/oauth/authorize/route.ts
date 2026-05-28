import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      client_id: string;
      redirect_uri: string;
      scope: string;
      state?: string;
    };

    const { client_id, redirect_uri, scope } = body;

    if (!client_id || !redirect_uri || !scope) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    try { new URL(redirect_uri); } catch {
      return NextResponse.json({ error: "redirect_uri invalide" }, { status: 400 });
    }

    // Vérifier que l'utilisateur est connecté
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet) =>
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const code = generateCode();

    // TODO: stocker dans Supabase oauth_codes table
    // await supabase.from("oauth_codes").insert({ code, client_id, redirect_uri, scope, user_id: user.id, expires_at: ... })

    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

function generateCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
