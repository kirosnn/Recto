export type Session = {
  id: string;
  code: string;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  status: "waiting" | "connected" | "ended";
};
