"use client";

import type { CSSProperties } from "react";
import type { PeerIdentity } from "../lib/webrtc";

// Floating badge showing the Discord identity of the connected peer.
export default function PeerBadge({
  peer,
  label,
  style,
}: {
  peer: PeerIdentity;
  label: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "6px 12px 6px 6px",
        borderRadius: "999px",
        background: "rgba(17,17,17,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
    >
      {peer.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={peer.avatar}
          alt={peer.name}
          style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "rgba(217,119,87,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 600,
            color: "#d97757",
          }}
        >
          {peer.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ fontSize: "0.62rem", color: "rgba(245,241,232,0.55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
        <span style={{ fontSize: "0.85rem", color: "#f5f1e8", fontWeight: 500 }}>
          {peer.name}
        </span>
      </div>
    </div>
  );
}
