"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Thème clair" : "Thème sombre"}
      style={{
        width: "32px", height: "32px", borderRadius: "8px",
        border: "1px solid var(--border)", background: "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "var(--tx-3)", fontSize: "13px",
        transition: "background 180ms ease, color 180ms ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--tx)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tx-3)"; }}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
