import { NextRequest, NextResponse } from "next/server";

// Génère un code d'autorisation OAuth temporaire.
// En production, stocker dans Supabase avec expiration courte (10 min).
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

    // Valider que redirect_uri est une URL valide
    try { new URL(redirect_uri); } catch {
      return NextResponse.json({ error: "redirect_uri invalide" }, { status: 400 });
    }

    // Générer un code opaque (en prod: stocker dans Supabase + lier à l'utilisateur)
    const code = generateCode();

    // TODO: stocker (code, client_id, redirect_uri, scope, user_id, expires_at) dans Supabase
    // await supabase.from("oauth_codes").insert({ code, client_id, redirect_uri, scope, expires_at: ... })

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
