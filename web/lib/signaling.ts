import { createClient } from "./supabase-browser";
import type { Session } from "./supabase";

export async function fetchSession(code: string): Promise<Session> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("code", code.toUpperCase())
    .single();
  if (error || !data) throw new Error("Session introuvable — vérifie le code");
  if (data.status === "ended") throw new Error("Cette session est terminée");
  if (data.status === "connected") throw new Error("Cette session est déjà occupée");
  return data as Session;
}

export async function submitAnswer(
  code: string,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ answer, status: "connected" })
    .eq("code", code.toUpperCase());
  if (error) throw error;
}
