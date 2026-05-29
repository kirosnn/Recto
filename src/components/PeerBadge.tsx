import type { CSSProperties } from "react";
import type { PeerIdentity } from "../context/RectoSessionContext";

// Badge showing the Discord identity of the connected peer.
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
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 14px 6px 6px",
        borderRadius: 999,
        border: "1px solid var(--border-2)",
        background: "var(--bg-alt)",
        ...style,
      }}
    >
      {peer.avatar ? (
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
            background: "var(--accent-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--accent)",
          }}
        >
          {peer.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ fontSize: "0.62rem", color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
        <span style={{ fontSize: "0.85rem", color: "var(--tx)", fontWeight: 500 }}>
          {peer.name}
        </span>
      </div>
    </div>
  );
}
