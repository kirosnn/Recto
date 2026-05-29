import { supabase, Session } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function createSession(
  offer: RTCSessionDescriptionInit
): Promise<string> {
  const code = randomCode();
  const { error } = await supabase.from("sessions").insert({
    code,
    offer,
    status: "waiting",
  });
  if (error) throw error;
  return code;
}

export async function fetchSession(code: string): Promise<Session> {
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
  const { error } = await supabase
    .from("sessions")
    .update({ answer, status: "connected" })
    .eq("code", code.toUpperCase());
  if (error) throw error;
}

export async function endSession(code: string): Promise<void> {
  await supabase
    .from("sessions")
    .update({ status: "ended" })
    .eq("code", code.toUpperCase());
}

export function subscribeToSession(
  sessionId: string,
  onUpdate: (session: Partial<Session>) => void
): RealtimeChannel {
  return supabase
    .channel(`session:${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "sessions",
        filter: `id=eq.${sessionId}`,
      },
      (payload) => onUpdate(payload.new as Partial<Session>)
    )
    .subscribe();
}

export function subscribeToIce(
  sessionId: string,
  role: "host" | "client",
  onCandidate: (candidate: RTCIceCandidateInit) => void
): { channel: RealtimeChannel; ready: Promise<void> } {
  const channel = supabase.channel(`ice:${sessionId}`);
  const event = role === "host" ? "client-ice" : "host-ice";
  let resolve!: () => void;
  const ready = new Promise<void>((r) => { resolve = r; });
  channel
    .on("broadcast", { event }, ({ payload }) => onCandidate(payload))
    .subscribe((status) => { if (status === "SUBSCRIBED") resolve(); });
  return { channel, ready };
}

export async function sendIceCandidate(
  channel: RealtimeChannel,
  role: "host" | "client",
  candidate: RTCIceCandidateInit
): Promise<void> {
  const event = role === "host" ? "host-ice" : "client-ice";
  await channel.send({ type: "broadcast", event, payload: candidate });
}
