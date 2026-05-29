import { createClient } from "./supabase-browser";
import { RealtimeChannel } from "@supabase/supabase-js";
import type { Session } from "./supabase";

export async function fetchSession(code: string): Promise<Session> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("code", code.toUpperCase())
    .eq("status", "waiting")
    .single();
  if (error || !data) throw new Error("Session introuvable ou expirée");
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

export function subscribeToIce(
  sessionId: string,
  onCandidate: (candidate: RTCIceCandidateInit) => void
): { channel: RealtimeChannel; ready: Promise<void> } {
  const supabase = createClient();
  const channel = supabase.channel(`ice:${sessionId}`);
  let resolve!: () => void;
  const ready = new Promise<void>((r) => { resolve = r; });
  channel
    .on("broadcast", { event: "host-ice" }, ({ payload }) => onCandidate(payload))
    .subscribe((status) => { if (status === "SUBSCRIBED") resolve(); });
  return { channel, ready };
}

export async function sendClientIce(
  channel: RealtimeChannel,
  candidate: RTCIceCandidateInit
): Promise<void> {
  await channel.send({
    type: "broadcast",
    event: "client-ice",
    payload: candidate,
  });
}
